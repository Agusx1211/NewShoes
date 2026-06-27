const canvas = document.querySelector("#viewport");
const gl = canvas.getContext("webgl2", {
  alpha: false,
  antialias: false,
  depth: true,
  stencil: false,
  preserveDrawingBuffer: true,
});
const fallbackContext = gl ? null : canvas.getContext("2d", { alpha: false });
const stateNode = document.querySelector("#state");
const framesNode = document.querySelector("#frames");
let d3d8DrawProgram = null;
const d3d8Buffers = new Map();
const d3d8Textures = new Map();
const d3d8BoundTextures = new Map();
const D3DUSAGE_WRITEONLY = 0x00000008;
const D3DUSAGE_DYNAMIC = 0x00000200;
const D3DLOCK_DISCARD = 0x00002000;
const D3DLOCK_NOOVERWRITE = 0x00001000;
const D3DFMT_R8G8B8 = 20;
const D3DFMT_A8R8G8B8 = 21;
const D3DFMT_X8R8G8B8 = 22;
const D3DFMT_R5G6B5 = 23;
const D3DFMT_X1R5G5B5 = 24;
const D3DFMT_A1R5G5B5 = 25;
const D3DFMT_A4R4G4B4 = 26;
const D3DFMT_A8 = 28;
const D3DFMT_X4R4G4B4 = 30;
const D3DFMT_P8 = 41;
const D3DFMT_L8 = 50;
const D3DFMT_A8L8 = 51;
const D3DZB_FALSE = 0;
const D3DZB_TRUE = 1;
const D3DZB_USEW = 2;
const D3DBLEND_ZERO = 1;
const D3DBLEND_ONE = 2;
const D3DBLEND_SRCCOLOR = 3;
const D3DBLEND_INVSRCCOLOR = 4;
const D3DBLEND_SRCALPHA = 5;
const D3DBLEND_INVSRCALPHA = 6;
const D3DBLEND_DESTALPHA = 7;
const D3DBLEND_INVDESTALPHA = 8;
const D3DBLEND_DESTCOLOR = 9;
const D3DBLEND_INVDESTCOLOR = 10;
const D3DBLEND_SRCALPHASAT = 11;
const D3DBLEND_BOTHSRCALPHA = 12;
const D3DBLEND_BOTHINVSRCALPHA = 13;
const D3DBLENDOP_ADD = 1;
const D3DBLENDOP_SUBTRACT = 2;
const D3DBLENDOP_REVSUBTRACT = 3;
const D3DBLENDOP_MIN = 4;
const D3DBLENDOP_MAX = 5;
const D3DCMP_NEVER = 1;
const D3DCMP_LESS = 2;
const D3DCMP_EQUAL = 3;
const D3DCMP_LESSEQUAL = 4;
const D3DCMP_GREATER = 5;
const D3DCMP_NOTEQUAL = 6;
const D3DCMP_GREATEREQUAL = 7;
const D3DCMP_ALWAYS = 8;
const D3DCULL_NONE = 1;
const D3DCULL_CW = 2;
const D3DCULL_CCW = 3;
const D3DCOLORWRITEENABLE_RED = 1;
const D3DCOLORWRITEENABLE_GREEN = 2;
const D3DCOLORWRITEENABLE_BLUE = 4;
const D3DCOLORWRITEENABLE_ALPHA = 8;
const D3DTSS_COLOROP = 1;
const D3DTSS_COLORARG1 = 2;
const D3DTSS_COLORARG2 = 3;
const D3DTSS_ALPHAOP = 4;
const D3DTSS_ALPHAARG1 = 5;
const D3DTSS_ALPHAARG2 = 6;
const D3DTSS_TEXCOORDINDEX = 11;
const D3DTSS_ADDRESSU = 13;
const D3DTSS_ADDRESSV = 14;
const D3DTSS_MAGFILTER = 16;
const D3DTSS_MINFILTER = 17;
const D3DTSS_MIPFILTER = 18;
const D3DTSS_TEXTURETRANSFORMFLAGS = 24;
const D3DTSS_ADDRESSW = 25;
const D3DTSS_COLORARG0 = 26;
const D3DTSS_ALPHAARG0 = 27;
const D3DTSS_RESULTARG = 28;
const D3DTOP_DISABLE = 1;
const D3DTOP_SELECTARG1 = 2;
const D3DTOP_MODULATE = 4;
const D3DTA_DIFFUSE = 0;
const D3DTA_CURRENT = 1;
const D3DTA_TEXTURE = 2;
const D3DTADDRESS_WRAP = 1;
const D3DTADDRESS_CLAMP = 3;
const D3DTEXF_NONE = 0;
const D3DTEXF_POINT = 1;
const D3DTEXF_LINEAR = 2;
const D3DTTFF_DISABLE = 0;
const D3D8_TEXTURE_STAGE_COUNT = 8;
const D3D8_DIFFUSE_OFFSET = 24;
const D3D8_DIFFUSE_MIN_STRIDE = D3D8_DIFFUSE_OFFSET + 4;
// Matches WW3D2/dx8fvf.h VertexFormatXYZNDUV1/2: XYZ, normal, diffuse, UV0.
const D3D8_XYZNDUV_TEXCOORD0_OFFSET = 28;
const D3D8_XYZNDUV_TEXCOORD0_MIN_STRIDE = D3D8_XYZNDUV_TEXCOORD0_OFFSET + 8;
const d3d8BufferStats = {
  creates: 0,
  updates: 0,
  releases: 0,
  lastCreate: null,
  lastStaticCreate: null,
  lastDynamicCreate: null,
  lastUpdate: null,
  lastRelease: null,
};
const d3d8TextureStats = {
  creates: 0,
  updates: 0,
  releases: 0,
  binds: 0,
  unbinds: 0,
  releaseUnbinds: 0,
  missingBinds: 0,
  unsupportedUpdates: 0,
  live: 0,
  lastCreate: null,
  lastUpdate: null,
  lastSubrectUpdate: null,
  lastRelease: null,
  lastBind: null,
  lastReleaseUnbind: null,
  lastMissingBind: null,
  lastUnsupported: null,
};

const harnessState = {
  booted: false,
  frame: 0,
  runtime: "js-stub",
  wasm: null,
  mainLoop: {
    running: false,
    fps: 0,
    ticks: 0,
  },
  timing: null,
  win32Timing: null,
  browserInput: null,
  canvas: {
    width: canvas.width,
    height: canvas.height,
    cssWidth: canvas.width,
    cssHeight: canvas.height,
    devicePixelRatio: 1,
  },
  graphics: {
    api: gl ? "webgl2" : "2d-fallback",
    ok: Boolean(gl),
    contextLost: false,
    drawingBufferWidth: canvas.width,
    drawingBufferHeight: canvas.height,
  },
  originalEngineLinked: false,
  originalCoreProbe: null,
  globalDataProbe: null,
  commandLineProbe: null,
  cdManagerProbe: null,
  fileSystemProbe: null,
  gameNetworkProbe: null,
  debugProbe: null,
  commonDebugLog: null,
  assetProbe: null,
  archiveMount: null,
  startupAssets: null,
  dataSummary: null,
  originalEngineStartup: null,
  originalWndProcInput: null,
  mountedArchives: [],
  logs: [],
};

const wasmModulePromise = loadWasmModule();

function getCanvasDisplaySize() {
  const rect = canvas.getBoundingClientRect();
  const devicePixelRatio = window.devicePixelRatio || 1;
  const cssWidth = rect.width || canvas.width;
  const cssHeight = rect.height || canvas.height;

  return {
    width: Math.max(1, Math.round(cssWidth * devicePixelRatio)),
    height: Math.max(1, Math.round(cssHeight * devicePixelRatio)),
    cssWidth,
    cssHeight,
    devicePixelRatio,
  };
}

function refreshCanvasState(displaySize = getCanvasDisplaySize()) {
  const previousGraphics = harnessState.graphics ?? {};
  harnessState.canvas = {
    width: canvas.width,
    height: canvas.height,
    cssWidth: Math.round(displaySize.cssWidth),
    cssHeight: Math.round(displaySize.cssHeight),
    devicePixelRatio: displaySize.devicePixelRatio,
  };
  harnessState.graphics = {
    ...previousGraphics,
    api: gl ? "webgl2" : "2d-fallback",
    ok: Boolean(gl),
    contextLost: gl ? gl.isContextLost() : false,
    drawingBufferWidth: gl ? gl.drawingBufferWidth : canvas.width,
    drawingBufferHeight: gl ? gl.drawingBufferHeight : canvas.height,
  };
}

function syncCanvasSize() {
  const displaySize = getCanvasDisplaySize();
  if (canvas.width !== displaySize.width || canvas.height !== displaySize.height) {
    canvas.width = displaySize.width;
    canvas.height = displaySize.height;
  }
  if (gl) {
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  }
  refreshCanvasState(displaySize);
}

function clampColorByte(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(0, Math.min(255, Math.round(number)));
}

function normalizeRgba(payload = {}, fallback = [0, 0, 0, 255]) {
  const source = Array.isArray(payload.rgba)
    ? payload.rgba
    : [payload.r, payload.g, payload.b, payload.a];

  return [
    clampColorByte(source[0], fallback[0]),
    clampColorByte(source[1], fallback[1]),
    clampColorByte(source[2], fallback[2]),
    clampColorByte(source[3], fallback[3]),
  ];
}

function d3dColorFromRgba(rgba) {
  return (((rgba[3] << 24) >>> 0) | (rgba[0] << 16) | (rgba[1] << 8) | rgba[2]) >>> 0;
}

function d3d8BufferKindName(kind) {
  switch (Number(kind) >>> 0) {
    case 1:
      return "vertex";
    case 2:
      return "index";
    default:
      return "unknown";
  }
}

function d3d8BufferKey(kind, id) {
  return `${d3d8BufferKindName(kind)}:${Number(id) >>> 0}`;
}

function d3d8BufferTarget(kind) {
  if (!gl) {
    return 0;
  }
  return d3d8BufferKindName(kind) === "index" ? gl.ELEMENT_ARRAY_BUFFER : gl.ARRAY_BUFFER;
}

function d3d8BufferUsageInfo(usage) {
  const d3dUsage = Number(usage ?? 0) >>> 0;
  const dynamic = Boolean(d3dUsage & D3DUSAGE_DYNAMIC);
  const writeOnly = Boolean(d3dUsage & D3DUSAGE_WRITEONLY);
  const glUsage = dynamic ? gl.STREAM_DRAW : writeOnly ? gl.STATIC_DRAW : gl.DYNAMIC_DRAW;
  const glUsageName = dynamic ? "streamDraw" : writeOnly ? "staticDraw" : "dynamicDraw";
  return {
    d3dUsage,
    dynamic,
    writeOnly,
    glUsage,
    glUsageName,
  };
}

function updateD3D8BufferSummary() {
  let liveVertex = 0;
  let liveIndex = 0;
  for (const resource of d3d8Buffers.values()) {
    if (resource.kindName === "vertex") {
      liveVertex += 1;
    } else if (resource.kindName === "index") {
      liveIndex += 1;
    }
  }
  harnessState.graphics = {
    ...harnessState.graphics,
    d3d8Buffers: {
      creates: d3d8BufferStats.creates,
      updates: d3d8BufferStats.updates,
      releases: d3d8BufferStats.releases,
      liveVertex,
      liveIndex,
      lastCreate: d3d8BufferStats.lastCreate,
      lastStaticCreate: d3d8BufferStats.lastStaticCreate,
      lastDynamicCreate: d3d8BufferStats.lastDynamicCreate,
      lastUpdate: d3d8BufferStats.lastUpdate,
      lastRelease: d3d8BufferStats.lastRelease,
    },
  };
}

function createD3D8Buffer(payload = {}) {
  if (!gl) {
    return 0;
  }
  const kind = Number(payload.kind ?? 0) >>> 0;
  const id = Number(payload.id ?? 0) >>> 0;
  const byteSize = Number(payload.byteSize ?? 0) >>> 0;
  const usageInfo = d3d8BufferUsageInfo(payload.usage);
  const target = d3d8BufferTarget(kind);
  if (id === 0 || byteSize === 0 || target === 0 || d3d8BufferKindName(kind) === "unknown") {
    return 0;
  }

  const key = d3d8BufferKey(kind, id);
  const existing = d3d8Buffers.get(key);
  if (existing) {
    gl.deleteBuffer(existing.buffer);
  }

  const buffer = gl.createBuffer();
  gl.bindBuffer(target, buffer);
  gl.bufferData(target, byteSize, usageInfo.glUsage);
  const record = {
    id,
    kind,
    kindName: d3d8BufferKindName(kind),
    byteSize,
    target,
    buffer,
    d3dUsage: usageInfo.d3dUsage,
    dynamic: usageInfo.dynamic,
    writeOnly: usageInfo.writeOnly,
    glUsage: usageInfo.glUsage,
    glUsageName: usageInfo.glUsageName,
    uploads: 0,
  };
  d3d8Buffers.set(key, record);
  d3d8BufferStats.creates += 1;
  d3d8BufferStats.lastCreate = {
    id,
    kind: record.kindName,
    byteSize,
    d3dUsage: record.d3dUsage,
    dynamic: record.dynamic,
    writeOnly: record.writeOnly,
    glUsage: record.glUsageName,
  };
  if (record.dynamic) {
    d3d8BufferStats.lastDynamicCreate = d3d8BufferStats.lastCreate;
  } else if (record.writeOnly) {
    d3d8BufferStats.lastStaticCreate = d3d8BufferStats.lastCreate;
  }
  updateD3D8BufferSummary();
  return 1;
}

function updateD3D8Buffer(payload = {}) {
  if (!gl || !(payload.bytes instanceof Uint8Array)) {
    return 0;
  }
  const kind = Number(payload.kind ?? 0) >>> 0;
  const id = Number(payload.id ?? 0) >>> 0;
  const bytes = payload.bytes;
  const byteOffset = Number(payload.byteOffset ?? 0) >>> 0;
  const lockFlags = Number(payload.lockFlags ?? 0) >>> 0;
  const requiredByteSize = byteOffset + bytes.byteLength;
  const key = d3d8BufferKey(kind, id);
  let resource = d3d8Buffers.get(key);
  if (!resource) {
    if (!createD3D8Buffer({ kind, id, byteSize: requiredByteSize, usage: payload.usage })) {
      return 0;
    }
    resource = d3d8Buffers.get(key);
  }
  if (!resource || bytes.byteLength === 0) {
    return 0;
  }

  gl.bindBuffer(resource.target, resource.buffer);
  let resized = false;
  let orphaned = false;
  if (requiredByteSize > resource.byteSize) {
    gl.bufferData(resource.target, requiredByteSize, resource.glUsage);
    resource.byteSize = requiredByteSize;
    resized = true;
  } else if (resource.dynamic && (lockFlags & D3DLOCK_DISCARD)) {
    gl.bufferData(resource.target, resource.byteSize, resource.glUsage);
    orphaned = true;
  }
  gl.bufferSubData(resource.target, byteOffset, bytes);
  resource.uploads += 1;
  d3d8BufferStats.updates += 1;
  d3d8BufferStats.lastUpdate = {
    id,
    kind: resource.kindName,
    byteOffset,
    byteSize: bytes.byteLength,
    d3dUsage: resource.d3dUsage,
    glUsage: resource.glUsageName,
    lockFlags,
    discard: Boolean(lockFlags & D3DLOCK_DISCARD),
    noOverwrite: Boolean(lockFlags & D3DLOCK_NOOVERWRITE),
    orphaned,
    resized,
    uploads: resource.uploads,
  };
  updateD3D8BufferSummary();
  return 1;
}

function releaseD3D8Buffer(payload = {}) {
  if (!gl) {
    return 0;
  }
  const kind = Number(payload.kind ?? 0) >>> 0;
  const id = Number(payload.id ?? 0) >>> 0;
  const key = d3d8BufferKey(kind, id);
  const resource = d3d8Buffers.get(key);
  if (!resource) {
    return 0;
  }
  gl.deleteBuffer(resource.buffer);
  d3d8Buffers.delete(key);
  d3d8BufferStats.releases += 1;
  d3d8BufferStats.lastRelease = { id, kind: resource.kindName };
  updateD3D8BufferSummary();
  return 1;
}

function d3d8TextureLevelSize(resource, level) {
  let width = resource.width;
  let height = resource.height;
  for (let index = 0; index < level; ++index) {
    width = Math.max(1, width >> 1);
    height = Math.max(1, height >> 1);
  }
  return { width, height };
}

function scale5(value) {
  return (value << 3) | (value >> 2);
}

function scale4(value) {
  return (value << 4) | value;
}

function d3d8TextureFormatInfo(format) {
  const d3dFormat = Number(format ?? 0) >>> 0;
  switch (d3dFormat) {
    case D3DFMT_R8G8B8:
    case D3DFMT_A8R8G8B8:
    case D3DFMT_X8R8G8B8:
    case D3DFMT_A1R5G5B5:
    case D3DFMT_A4R4G4B4:
    case D3DFMT_X1R5G5B5:
    case D3DFMT_X4R4G4B4:
      return {
        d3dFormat,
        supported: true,
        internalFormat: gl.RGBA8,
        format: gl.RGBA,
        type: gl.UNSIGNED_BYTE,
        storage: "rgba8",
      };
    case D3DFMT_R5G6B5:
      return {
        d3dFormat,
        supported: true,
        internalFormat: gl.RGB565,
        format: gl.RGB,
        type: gl.UNSIGNED_SHORT_5_6_5,
        storage: "rgb565",
      };
    case D3DFMT_A8:
      return {
        d3dFormat,
        supported: true,
        internalFormat: gl.R8,
        format: gl.RED,
        type: gl.UNSIGNED_BYTE,
        storage: "r8-alpha",
      };
    case D3DFMT_L8:
      return {
        d3dFormat,
        supported: true,
        internalFormat: gl.R8,
        format: gl.RED,
        type: gl.UNSIGNED_BYTE,
        storage: "r8-luminance",
      };
    case D3DFMT_A8L8:
      return {
        d3dFormat,
        supported: true,
        internalFormat: gl.RG8,
        format: gl.RG,
        type: gl.UNSIGNED_BYTE,
        storage: "rg8-luminance-alpha",
      };
    case D3DFMT_P8:
      return {
        d3dFormat,
        supported: false,
        reason: "P8 needs the engine palette before WebGL upload",
      };
    default:
      return {
        d3dFormat,
        supported: false,
        reason: "format is not implemented by the initial uncompressed texture bridge",
      };
  }
}

function convertD3D8TextureBytes(format, bytes, width, height) {
  const d3dFormat = Number(format ?? 0) >>> 0;
  const pixelCount = width * height;
  if (d3dFormat === D3DFMT_A8R8G8B8 || d3dFormat === D3DFMT_X8R8G8B8) {
    const output = new Uint8Array(pixelCount * 4);
    for (let pixel = 0; pixel < pixelCount; ++pixel) {
      const source = pixel * 4;
      const target = pixel * 4;
      output[target] = bytes[source + 2];
      output[target + 1] = bytes[source + 1];
      output[target + 2] = bytes[source];
      output[target + 3] = d3dFormat === D3DFMT_X8R8G8B8 ? 255 : bytes[source + 3];
    }
    return output;
  }
  if (d3dFormat === D3DFMT_R8G8B8) {
    const output = new Uint8Array(pixelCount * 4);
    for (let pixel = 0; pixel < pixelCount; ++pixel) {
      const source = pixel * 3;
      const target = pixel * 4;
      output[target] = bytes[source + 2];
      output[target + 1] = bytes[source + 1];
      output[target + 2] = bytes[source];
      output[target + 3] = 255;
    }
    return output;
  }
  if (d3dFormat === D3DFMT_A1R5G5B5 || d3dFormat === D3DFMT_X1R5G5B5) {
    const output = new Uint8Array(pixelCount * 4);
    for (let pixel = 0; pixel < pixelCount; ++pixel) {
      const source = pixel * 2;
      const value = bytes[source] | (bytes[source + 1] << 8);
      const target = pixel * 4;
      output[target] = scale5((value >> 10) & 0x1f);
      output[target + 1] = scale5((value >> 5) & 0x1f);
      output[target + 2] = scale5(value & 0x1f);
      output[target + 3] = d3dFormat === D3DFMT_X1R5G5B5 ? 255 : (value & 0x8000) ? 255 : 0;
    }
    return output;
  }
  if (d3dFormat === D3DFMT_A4R4G4B4 || d3dFormat === D3DFMT_X4R4G4B4) {
    const output = new Uint8Array(pixelCount * 4);
    for (let pixel = 0; pixel < pixelCount; ++pixel) {
      const source = pixel * 2;
      const value = bytes[source] | (bytes[source + 1] << 8);
      const target = pixel * 4;
      output[target] = scale4((value >> 8) & 0x0f);
      output[target + 1] = scale4((value >> 4) & 0x0f);
      output[target + 2] = scale4(value & 0x0f);
      output[target + 3] = d3dFormat === D3DFMT_X4R4G4B4 ? 255 : scale4((value >> 12) & 0x0f);
    }
    return output;
  }
  return bytes;
}

function d3d8TextureUploadView(info, bytes) {
  if (info.type !== gl.UNSIGNED_SHORT_5_6_5) {
    return bytes;
  }
  const copy = new Uint8Array(bytes);
  return new Uint16Array(copy.buffer);
}

function withPreservedD3D8TextureUnit(callback) {
  if (!gl) {
    return null;
  }
  const previousActiveTexture = gl.getParameter(gl.ACTIVE_TEXTURE);
  gl.activeTexture(gl.TEXTURE0);
  const previousTexture = gl.getParameter(gl.TEXTURE_BINDING_2D);
  try {
    return callback();
  } finally {
    gl.bindTexture(gl.TEXTURE_2D, previousTexture);
    gl.activeTexture(previousActiveTexture);
  }
}

function sampleD3D8TexturePixel(resource, x, y) {
  if (!gl || !resource?.texture) {
    return null;
  }
  const framebuffer = gl.createFramebuffer();
  const previousFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, resource.texture, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  let pixel = null;
  if (status === gl.FRAMEBUFFER_COMPLETE) {
    const readX = Math.max(0, Math.min(resource.width - 1, Math.trunc(x)));
    const readY = Math.max(0, Math.min(resource.height - 1, Math.trunc(y)));
    const pixels = new Uint8Array(4);
    gl.readPixels(readX, readY, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    pixel = Array.from(pixels);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);
  gl.deleteFramebuffer(framebuffer);
  return pixel;
}

function updateD3D8TextureSummary() {
  d3d8TextureStats.live = d3d8Textures.size;
  const boundTextures = {};
  for (const [stage, textureId] of d3d8BoundTextures.entries()) {
    boundTextures[String(stage)] = textureId;
  }
  harnessState.graphics = {
    ...harnessState.graphics,
    d3d8Textures: {
      creates: d3d8TextureStats.creates,
      updates: d3d8TextureStats.updates,
      releases: d3d8TextureStats.releases,
      binds: d3d8TextureStats.binds,
      unbinds: d3d8TextureStats.unbinds,
      releaseUnbinds: d3d8TextureStats.releaseUnbinds,
      missingBinds: d3d8TextureStats.missingBinds,
      unsupportedUpdates: d3d8TextureStats.unsupportedUpdates,
      live: d3d8TextureStats.live,
      boundTextures,
      lastCreate: d3d8TextureStats.lastCreate,
      lastUpdate: d3d8TextureStats.lastUpdate,
      lastSubrectUpdate: d3d8TextureStats.lastSubrectUpdate,
      lastRelease: d3d8TextureStats.lastRelease,
      lastBind: d3d8TextureStats.lastBind,
      lastReleaseUnbind: d3d8TextureStats.lastReleaseUnbind,
      lastMissingBind: d3d8TextureStats.lastMissingBind,
      lastUnsupported: d3d8TextureStats.lastUnsupported,
    },
  };
}

function createD3D8Texture(payload = {}) {
  if (!gl) {
    return 0;
  }
  const id = Number(payload.id ?? 0) >>> 0;
  const width = Number(payload.width ?? 0) >>> 0;
  const height = Number(payload.height ?? 0) >>> 0;
  const levels = Math.max(1, Number(payload.levels ?? 1) >>> 0);
  const format = Number(payload.format ?? 0) >>> 0;
  if (id === 0 || width === 0 || height === 0) {
    return 0;
  }

  const existing = d3d8Textures.get(id);
  if (existing) {
    gl.deleteTexture(existing.texture);
  }

  const texture = gl.createTexture();
  withPreservedD3D8TextureUnit(() => {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  });
  const resource = {
    id,
    width,
    height,
    levels,
    format,
    usage: Number(payload.usage ?? 0) >>> 0,
    pool: Number(payload.pool ?? 0) >>> 0,
    texture,
    initializedLevels: new Set(),
    levelFormats: new Map(),
    uploads: 0,
  };
  d3d8Textures.set(id, resource);
  d3d8TextureStats.creates += 1;
  d3d8TextureStats.lastCreate = {
    id,
    width,
    height,
    levels,
    format,
    usage: resource.usage,
    pool: resource.pool,
  };
  updateD3D8TextureSummary();
  return 1;
}

function updateD3D8Texture(payload = {}) {
  if (!gl || !(payload.bytes instanceof Uint8Array)) {
    return 0;
  }
  const id = Number(payload.id ?? 0) >>> 0;
  const level = Number(payload.level ?? 0) >>> 0;
  const x = Number(payload.x ?? 0) >>> 0;
  const y = Number(payload.y ?? 0) >>> 0;
  const width = Number(payload.width ?? 0) >>> 0;
  const height = Number(payload.height ?? 0) >>> 0;
  const format = Number(payload.format ?? 0) >>> 0;
  let resource = d3d8Textures.get(id);
  if (!resource) {
    if (!createD3D8Texture({ id, width, height, levels: level + 1, format, usage: payload.usage })) {
      return 0;
    }
    resource = d3d8Textures.get(id);
  }
  if (!resource || width === 0 || height === 0 || level >= resource.levels) {
    return 0;
  }

  const info = d3d8TextureFormatInfo(format);
  if (!info.supported) {
    d3d8TextureStats.unsupportedUpdates += 1;
    d3d8TextureStats.lastUnsupported = {
      id,
      level,
      format,
      reason: info.reason,
    };
    updateD3D8TextureSummary();
    return 0;
  }

  const levelSize = d3d8TextureLevelSize(resource, level);
  if (x + width > levelSize.width || y + height > levelSize.height) {
    return 0;
  }

  const convertedBytes = convertD3D8TextureBytes(format, payload.bytes, width, height);
  const uploadBytes = d3d8TextureUploadView(info, convertedBytes);
  const levelKey = String(level);
  const levelInitialized = resource.initializedLevels.has(levelKey);
  const levelFormat = resource.levelFormats.get(levelKey);
  withPreservedD3D8TextureUnit(() => {
    gl.bindTexture(gl.TEXTURE_2D, resource.texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (!levelInitialized || levelFormat !== info.storage) {
      if (x === 0 && y === 0 && width === levelSize.width && height === levelSize.height) {
        gl.texImage2D(gl.TEXTURE_2D, level, info.internalFormat, width, height, 0,
          info.format, info.type, uploadBytes);
      } else {
        gl.texImage2D(gl.TEXTURE_2D, level, info.internalFormat, levelSize.width, levelSize.height, 0,
          info.format, info.type, null);
        gl.texSubImage2D(gl.TEXTURE_2D, level, x, y, width, height, info.format, info.type, uploadBytes);
      }
      resource.initializedLevels.add(levelKey);
      resource.levelFormats.set(levelKey, info.storage);
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, level, x, y, width, height, info.format, info.type, uploadBytes);
    }
  });

  resource.uploads += 1;
  d3d8TextureStats.updates += 1;
  d3d8TextureStats.lastUpdate = {
    id,
    level,
    x,
    y,
    width,
    height,
    format,
    storage: info.storage,
    pitch: Number(payload.pitch ?? 0) >>> 0,
    rowBytes: Number(payload.rowBytes ?? 0) >>> 0,
    byteSize: payload.bytes.byteLength,
    convertedByteSize: convertedBytes.byteLength,
    usage: Number(payload.usage ?? 0) >>> 0,
    lockFlags: Number(payload.lockFlags ?? 0) >>> 0,
    uploads: resource.uploads,
    samplePixel: level === 0 && info.storage === "rgba8" ? sampleD3D8TexturePixel(resource, x, y) : null,
  };
  if (x !== 0 || y !== 0 || width !== levelSize.width || height !== levelSize.height) {
    d3d8TextureStats.lastSubrectUpdate = d3d8TextureStats.lastUpdate;
  }
  updateD3D8TextureSummary();
  return 1;
}

function releaseD3D8Texture(payload = {}) {
  if (!gl) {
    return 0;
  }
  const id = Number(payload.id ?? 0) >>> 0;
  const resource = d3d8Textures.get(id);
  if (!resource) {
    return 0;
  }
  const releasedBindings = [];
  for (const [stage, textureId] of d3d8BoundTextures.entries()) {
    if (textureId === id) {
      const previousActiveTexture = gl.getParameter(gl.ACTIVE_TEXTURE);
      gl.activeTexture(gl.TEXTURE0 + stage);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(previousActiveTexture);
      d3d8BoundTextures.delete(stage);
      releasedBindings.push(stage);
    }
  }
  gl.deleteTexture(resource.texture);
  d3d8Textures.delete(id);
  d3d8TextureStats.releases += 1;
  if (releasedBindings.length > 0) {
    d3d8TextureStats.releaseUnbinds += releasedBindings.length;
    d3d8TextureStats.lastReleaseUnbind = { id, stages: releasedBindings };
  }
  d3d8TextureStats.lastRelease = { id, releasedBindings };
  updateD3D8TextureSummary();
  return 1;
}

function bindD3D8Texture(payload = {}) {
  if (!gl) {
    return 0;
  }
  const stage = Number(payload.stage ?? 0) >>> 0;
  const id = Number(payload.id ?? 0) >>> 0;
  const maxTextureUnits = gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS);
  if (stage >= maxTextureUnits) {
    d3d8TextureStats.missingBinds += 1;
    d3d8TextureStats.lastMissingBind = {
      stage,
      id,
      reason: "stage exceeds WebGL texture units",
      maxTextureUnits,
    };
    updateD3D8TextureSummary();
    return 0;
  }

  const previousActiveTexture = gl.getParameter(gl.ACTIVE_TEXTURE);
  gl.activeTexture(gl.TEXTURE0 + stage);
  if (id === 0) {
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(previousActiveTexture);
    d3d8BoundTextures.delete(stage);
    d3d8TextureStats.unbinds += 1;
    d3d8TextureStats.lastBind = {
      stage,
      id,
      ok: true,
      nullBind: true,
      boundTexture: null,
    };
    updateD3D8TextureSummary();
    return 1;
  }

  const resource = d3d8Textures.get(id);
  if (!resource) {
    gl.activeTexture(previousActiveTexture);
    d3d8TextureStats.missingBinds += 1;
    d3d8TextureStats.lastMissingBind = {
      stage,
      id,
      reason: "texture id is not live",
    };
    updateD3D8TextureSummary();
    return 0;
  }

  gl.bindTexture(gl.TEXTURE_2D, resource.texture);
  gl.activeTexture(previousActiveTexture);
  d3d8BoundTextures.set(stage, id);
  d3d8TextureStats.binds += 1;
  d3d8TextureStats.lastBind = {
    stage,
    id,
    ok: true,
    nullBind: false,
    width: resource.width,
    height: resource.height,
    levels: resource.levels,
    format: resource.format,
    uploads: resource.uploads,
  };
  updateD3D8TextureSummary();
  return 1;
}

function sampleCanvasPixel(x = 0, y = 0) {
  const pixels = new Uint8Array(4);
  if (gl) {
    const readX = Math.max(0, Math.min(gl.drawingBufferWidth - 1, Math.trunc(x)));
    const readY = Math.max(0, Math.min(gl.drawingBufferHeight - 1, Math.trunc(y)));
    gl.readPixels(readX, gl.drawingBufferHeight - 1 - readY, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  } else if (fallbackContext) {
    const readX = Math.max(0, Math.min(canvas.width - 1, Math.trunc(x)));
    const readY = Math.max(0, Math.min(canvas.height - 1, Math.trunc(y)));
    pixels.set(fallbackContext.getImageData(readX, readY, 1, 1).data);
  }
  return Array.from(pixels);
}

function pixelsApproximatelyEqual(left, right, tolerance = 1) {
  return left.length === right.length
    && left.every((component, index) => Math.abs(component - right[index]) <= tolerance);
}

function paintCanvasRgba(rgba) {
  syncCanvasSize();
  if (gl) {
    gl.clearColor(rgba[0] / 255, rgba[1] / 255, rgba[2] / 255, rgba[3] / 255);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  } else if (fallbackContext) {
    fallbackContext.fillStyle = `rgb(${rgba[0]} ${rgba[1]} ${rgba[2]})`;
    fallbackContext.fillRect(0, 0, canvas.width, canvas.height);
  }
  refreshCanvasState();
  return sampleCanvasPixel(0, 0);
}

function clearCanvas(payload = {}) {
  const rgba = normalizeRgba(payload);
  const pixel = paintCanvasRgba(rgba);
  const ok = pixelsApproximatelyEqual(pixel, rgba);
  harnessState.graphics = {
    ...harnessState.graphics,
    lastClearColor: rgba,
    lastClearPixel: pixel,
    lastClearOk: ok,
  };

  return {
    ok,
    source: gl ? "browser_webgl2_clear" : "browser_2d_clear",
    api: harnessState.graphics.api,
    clearColor: rgba,
    topLeftPixel: pixel,
  };
}

function paintD3D8Clear(flags, red, green, blue, alpha, z, stencil) {
  const clearFlags = flags >>> 0;
  const rgba = [
    clampColorByte(red, 0),
    clampColorByte(green, 0),
    clampColorByte(blue, 0),
    clampColorByte(alpha, 255),
  ];
  syncCanvasSize();
  if (gl) {
    let clearBits = 0;
    if ((clearFlags & 0x1) !== 0) {
      gl.clearColor(rgba[0] / 255, rgba[1] / 255, rgba[2] / 255, rgba[3] / 255);
      clearBits |= gl.COLOR_BUFFER_BIT;
    }
    if ((clearFlags & 0x2) !== 0) {
      gl.clearDepth(Number(z));
      clearBits |= gl.DEPTH_BUFFER_BIT;
    }
    if ((clearFlags & 0x4) !== 0 && gl.getContextAttributes()?.stencil) {
      gl.clearStencil(stencil >>> 0);
      clearBits |= gl.STENCIL_BUFFER_BIT;
    }
    if (clearBits !== 0) {
      gl.clear(clearBits);
    }
  } else if (fallbackContext && (clearFlags & 0x1) !== 0) {
    fallbackContext.fillStyle = `rgb(${rgba[0]} ${rgba[1]} ${rgba[2]})`;
    fallbackContext.fillRect(0, 0, canvas.width, canvas.height);
  }
  refreshCanvasState();
  const pixel = sampleCanvasPixel(0, 0);
  const colorOk = (clearFlags & 0x1) === 0 || pixelsApproximatelyEqual(pixel, rgba);
  const probe = {
    ok: colorOk,
    source: "browser_d3d8_clear",
    api: harnessState.graphics.api,
    flags: clearFlags,
    clearColor: rgba,
    topLeftPixel: pixel,
    z: Number(z),
    stencil: stencil >>> 0,
  };
  harnessState.graphics = {
    ...harnessState.graphics,
    lastD3D8Clear: probe,
    lastClearColor: rgba,
    lastClearPixel: pixel,
    lastClearOk: colorOk,
  };
  return colorOk ? 1 : 0;
}

function compileShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`D3D8 bridge shader compile failed: ${info}`);
  }
  return shader;
}

function ensureD3D8DrawProgram() {
  if (!gl) {
    return null;
  }
  if (d3d8DrawProgram) {
    return d3d8DrawProgram;
  }

  const vertexShader = compileShader(gl.VERTEX_SHADER, `#version 300 es
    in vec3 aPosition;
    in vec4 aDiffuseBgra;
    in vec2 aTexCoord0;
    uniform float uScale;
    uniform bool uUseTransforms;
    uniform mat4 uWorld;
    uniform mat4 uView;
    uniform mat4 uProjection;
    out vec4 vColor;
    out vec2 vTexCoord0;
    void main() {
      if (uUseTransforms) {
        vec4 d3dClip = uProjection * uView * uWorld * vec4(aPosition, 1.0);
        gl_Position = vec4(d3dClip.x, d3dClip.y, d3dClip.z * 2.0 - d3dClip.w, d3dClip.w);
      } else {
        gl_Position = vec4(aPosition.x / uScale, aPosition.y / uScale, 0.0, 1.0);
      }
      vColor = vec4(aDiffuseBgra.b, aDiffuseBgra.g, aDiffuseBgra.r, aDiffuseBgra.a);
      vTexCoord0 = aTexCoord0;
    }
  `);
  const fragmentShader = compileShader(gl.FRAGMENT_SHADER, `#version 300 es
    precision mediump float;
    in vec4 vColor;
    in vec2 vTexCoord0;
    uniform bool uUseTexture0;
    uniform sampler2D uTexture0;
    uniform bool uAlphaTestEnabled;
    uniform int uAlphaFunc;
    uniform float uAlphaRef;
    out vec4 fragColor;
    bool d3dAlphaCompare(float value, float reference) {
      if (uAlphaFunc == 1) {
        return false;
      }
      if (uAlphaFunc == 2) {
        return value < reference;
      }
      if (uAlphaFunc == 3) {
        return value == reference;
      }
      if (uAlphaFunc == 4) {
        return value <= reference;
      }
      if (uAlphaFunc == 5) {
        return value > reference;
      }
      if (uAlphaFunc == 6) {
        return value != reference;
      }
      if (uAlphaFunc == 7) {
        return value >= reference;
      }
      return true;
    }
    void main() {
      vec4 color = vColor;
      if (uUseTexture0) {
        color *= texture(uTexture0, vTexCoord0);
      }
      if (uAlphaTestEnabled && !d3dAlphaCompare(color.a, uAlphaRef)) {
        discard;
      }
      fragColor = color;
    }
  `);
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`D3D8 bridge program link failed: ${info}`);
  }

  d3d8DrawProgram = {
    program,
    position: gl.getAttribLocation(program, "aPosition"),
    diffuse: gl.getAttribLocation(program, "aDiffuseBgra"),
    texCoord0: gl.getAttribLocation(program, "aTexCoord0"),
    scale: gl.getUniformLocation(program, "uScale"),
    useTransforms: gl.getUniformLocation(program, "uUseTransforms"),
    world: gl.getUniformLocation(program, "uWorld"),
    view: gl.getUniformLocation(program, "uView"),
    projection: gl.getUniformLocation(program, "uProjection"),
    useTexture0: gl.getUniformLocation(program, "uUseTexture0"),
    texture0: gl.getUniformLocation(program, "uTexture0"),
    alphaTestEnabled: gl.getUniformLocation(program, "uAlphaTestEnabled"),
    alphaFunc: gl.getUniformLocation(program, "uAlphaFunc"),
    alphaRef: gl.getUniformLocation(program, "uAlphaRef"),
  };
  return d3d8DrawProgram;
}

function d3dPrimitiveToGl(primitiveType) {
  if (!gl) {
    return 0;
  }
  switch (Number(primitiveType)) {
    case 1:
      return gl.POINTS;
    case 2:
      return gl.LINES;
    case 3:
      return gl.LINE_STRIP;
    case 4:
      return gl.TRIANGLES;
    case 5:
      return gl.TRIANGLE_STRIP;
    case 6:
      return gl.TRIANGLE_FAN;
    default:
      return 0;
  }
}

function pixelHasColor(pixel, threshold = 8) {
  return Array.isArray(pixel) && pixel.slice(0, 3).some((component) => component > threshold);
}

function pixelLooksRed(pixel) {
  return Array.isArray(pixel)
    && pixel[0] >= 180
    && pixel[1] <= 80
    && pixel[2] <= 80
    && pixel[3] >= 200;
}

function normalizeD3DMatrix(matrix) {
  if (!Array.isArray(matrix) || matrix.length !== 16) {
    return null;
  }
  if (!matrix.every(Number.isFinite)) {
    return null;
  }
  return new Float32Array(matrix);
}

function defaultD3D8TextureStageValue(stage, state) {
  switch (Number(state) >>> 0) {
    case D3DTSS_COLOROP:
      return stage === 0 ? D3DTOP_MODULATE : D3DTOP_DISABLE;
    case D3DTSS_COLORARG1:
      return D3DTA_TEXTURE;
    case D3DTSS_COLORARG2:
      return D3DTA_CURRENT;
    case D3DTSS_ALPHAOP:
      return stage === 0 ? D3DTOP_SELECTARG1 : D3DTOP_DISABLE;
    case D3DTSS_ALPHAARG1:
      return D3DTA_TEXTURE;
    case D3DTSS_ALPHAARG2:
      return D3DTA_CURRENT;
    case D3DTSS_TEXCOORDINDEX:
      return stage;
    case D3DTSS_ADDRESSU:
    case D3DTSS_ADDRESSV:
    case D3DTSS_ADDRESSW:
      return D3DTADDRESS_WRAP;
    case D3DTSS_MAGFILTER:
    case D3DTSS_MINFILTER:
      return D3DTEXF_POINT;
    case D3DTSS_MIPFILTER:
      return D3DTEXF_NONE;
    case D3DTSS_TEXTURETRANSFORMFLAGS:
      return D3DTTFF_DISABLE;
    case D3DTSS_COLORARG0:
    case D3DTSS_ALPHAARG0:
    case D3DTSS_RESULTARG:
      return D3DTA_CURRENT;
    default:
      return 0;
  }
}

function normalizeD3D8TextureStageState(textureStage = {}, stageIndex = 0) {
  const stage = Number(textureStage?.stage ?? stageIndex) >>> 0;
  const value = (key, state) =>
    Number(textureStage?.[key] ?? defaultD3D8TextureStageValue(stage, state)) >>> 0;
  return {
    stage,
    colorOp: value("colorOp", D3DTSS_COLOROP),
    colorArg1: value("colorArg1", D3DTSS_COLORARG1),
    colorArg2: value("colorArg2", D3DTSS_COLORARG2),
    alphaOp: value("alphaOp", D3DTSS_ALPHAOP),
    alphaArg1: value("alphaArg1", D3DTSS_ALPHAARG1),
    alphaArg2: value("alphaArg2", D3DTSS_ALPHAARG2),
    texCoordIndex: value("texCoordIndex", D3DTSS_TEXCOORDINDEX),
    addressU: value("addressU", D3DTSS_ADDRESSU),
    addressV: value("addressV", D3DTSS_ADDRESSV),
    magFilter: value("magFilter", D3DTSS_MAGFILTER),
    minFilter: value("minFilter", D3DTSS_MINFILTER),
    mipFilter: value("mipFilter", D3DTSS_MIPFILTER),
    textureTransformFlags: value("textureTransformFlags", D3DTSS_TEXTURETRANSFORMFLAGS),
    addressW: value("addressW", D3DTSS_ADDRESSW),
    colorArg0: value("colorArg0", D3DTSS_COLORARG0),
    alphaArg0: value("alphaArg0", D3DTSS_ALPHAARG0),
    resultArg: value("resultArg", D3DTSS_RESULTARG),
    borderColor: Number(textureStage?.borderColor ?? 0) >>> 0,
    maxMipLevel: Number(textureStage?.maxMipLevel ?? 0) >>> 0,
    maxAnisotropy: Number(textureStage?.maxAnisotropy ?? 1) >>> 0,
    mipMapLodBias: Number(textureStage?.mipMapLodBias ?? 0) >>> 0,
    bumpEnvMat00: Number(textureStage?.bumpEnvMat00 ?? 0) >>> 0,
    bumpEnvMat01: Number(textureStage?.bumpEnvMat01 ?? 0) >>> 0,
    bumpEnvMat10: Number(textureStage?.bumpEnvMat10 ?? 0) >>> 0,
    bumpEnvMat11: Number(textureStage?.bumpEnvMat11 ?? 0) >>> 0,
    bumpEnvLScale: Number(textureStage?.bumpEnvLScale ?? 0) >>> 0,
    bumpEnvLOffset: Number(textureStage?.bumpEnvLOffset ?? 0) >>> 0,
  };
}

function normalizeD3D8TextureStages(textureStages) {
  return Array.from({ length: D3D8_TEXTURE_STAGE_COUNT }, (_, stage) =>
    normalizeD3D8TextureStageState(Array.isArray(textureStages) ? textureStages[stage] : null, stage));
}

function normalizeD3D8RenderState(renderState = {}) {
  return {
    cullMode: Number(renderState.cullMode ?? D3DCULL_CW) >>> 0,
    zEnable: Number(renderState.zEnable ?? D3DZB_TRUE) >>> 0,
    zWriteEnable: Number(renderState.zWriteEnable ?? 1) >>> 0,
    zFunc: Number(renderState.zFunc ?? D3DCMP_LESSEQUAL) >>> 0,
    alphaBlendEnable: Number(renderState.alphaBlendEnable ?? 0) >>> 0,
    srcBlend: Number(renderState.srcBlend ?? D3DBLEND_ONE) >>> 0,
    destBlend: Number(renderState.destBlend ?? D3DBLEND_ZERO) >>> 0,
    blendOp: Number(renderState.blendOp ?? D3DBLENDOP_ADD) >>> 0,
    alphaTestEnable: Number(renderState.alphaTestEnable ?? 0) >>> 0,
    alphaFunc: Number(renderState.alphaFunc ?? D3DCMP_LESSEQUAL) >>> 0,
    alphaRef: Number(renderState.alphaRef ?? 0) >>> 0,
    colorWriteEnable: Number(renderState.colorWriteEnable ??
      (D3DCOLORWRITEENABLE_RED | D3DCOLORWRITEENABLE_GREEN |
        D3DCOLORWRITEENABLE_BLUE | D3DCOLORWRITEENABLE_ALPHA)) >>> 0,
    textureStages: normalizeD3D8TextureStages(renderState.textureStages),
  };
}

function d3dCmpToGl(compareFunc) {
  switch (Number(compareFunc) >>> 0) {
    case D3DCMP_NEVER:
      return gl.NEVER;
    case D3DCMP_LESS:
      return gl.LESS;
    case D3DCMP_EQUAL:
      return gl.EQUAL;
    case D3DCMP_LESSEQUAL:
      return gl.LEQUAL;
    case D3DCMP_GREATER:
      return gl.GREATER;
    case D3DCMP_NOTEQUAL:
      return gl.NOTEQUAL;
    case D3DCMP_GREATEREQUAL:
      return gl.GEQUAL;
    case D3DCMP_ALWAYS:
    default:
      return gl.ALWAYS;
  }
}

function d3dBlendFactorToGl(blendFactor) {
  switch (Number(blendFactor) >>> 0) {
    case D3DBLEND_ZERO:
      return gl.ZERO;
    case D3DBLEND_ONE:
      return gl.ONE;
    case D3DBLEND_SRCCOLOR:
      return gl.SRC_COLOR;
    case D3DBLEND_INVSRCCOLOR:
      return gl.ONE_MINUS_SRC_COLOR;
    case D3DBLEND_SRCALPHA:
    case D3DBLEND_BOTHSRCALPHA:
      return gl.SRC_ALPHA;
    case D3DBLEND_INVSRCALPHA:
    case D3DBLEND_BOTHINVSRCALPHA:
      return gl.ONE_MINUS_SRC_ALPHA;
    case D3DBLEND_DESTALPHA:
      return gl.DST_ALPHA;
    case D3DBLEND_INVDESTALPHA:
      return gl.ONE_MINUS_DST_ALPHA;
    case D3DBLEND_DESTCOLOR:
      return gl.DST_COLOR;
    case D3DBLEND_INVDESTCOLOR:
      return gl.ONE_MINUS_DST_COLOR;
    case D3DBLEND_SRCALPHASAT:
      return gl.SRC_ALPHA_SATURATE;
    default:
      return gl.ONE;
  }
}

function d3dBlendOpToGl(blendOp) {
  switch (Number(blendOp) >>> 0) {
    case D3DBLENDOP_SUBTRACT:
      return gl.FUNC_SUBTRACT;
    case D3DBLENDOP_REVSUBTRACT:
      return gl.FUNC_REVERSE_SUBTRACT;
    case D3DBLENDOP_MIN:
      return gl.MIN;
    case D3DBLENDOP_MAX:
      return gl.MAX;
    case D3DBLENDOP_ADD:
    default:
      return gl.FUNC_ADD;
  }
}

function applyD3D8RenderState(renderState) {
  const state = normalizeD3D8RenderState(renderState);
  const cullEnabled = state.cullMode === D3DCULL_CW || state.cullMode === D3DCULL_CCW;
  const cullFace = state.cullMode === D3DCULL_CCW ? gl.FRONT : gl.BACK;
  const depthEnabled = state.zEnable === D3DZB_TRUE || state.zEnable === D3DZB_USEW;
  const depthFunc = d3dCmpToGl(state.zFunc);
  const blendEnabled = state.alphaBlendEnable !== 0;
  const srcBlend = d3dBlendFactorToGl(state.srcBlend);
  const destBlend = d3dBlendFactorToGl(state.destBlend);
  const blendEquation = d3dBlendOpToGl(state.blendOp);
  const colorMask = {
    r: Boolean(state.colorWriteEnable & D3DCOLORWRITEENABLE_RED),
    g: Boolean(state.colorWriteEnable & D3DCOLORWRITEENABLE_GREEN),
    b: Boolean(state.colorWriteEnable & D3DCOLORWRITEENABLE_BLUE),
    a: Boolean(state.colorWriteEnable & D3DCOLORWRITEENABLE_ALPHA),
  };

  gl.frontFace(gl.CW);
  if (cullEnabled) {
    gl.enable(gl.CULL_FACE);
    gl.cullFace(cullFace);
  } else {
    gl.disable(gl.CULL_FACE);
  }

  if (depthEnabled) {
    gl.enable(gl.DEPTH_TEST);
  } else {
    gl.disable(gl.DEPTH_TEST);
  }
  gl.depthMask(state.zWriteEnable !== 0);
  gl.depthFunc(depthFunc);

  if (blendEnabled) {
    gl.enable(gl.BLEND);
  } else {
    gl.disable(gl.BLEND);
  }
  gl.blendFunc(srcBlend, destBlend);
  gl.blendEquation(blendEquation);
  gl.colorMask(colorMask.r, colorMask.g, colorMask.b, colorMask.a);

  return {
    d3d: state,
    cull: {
      enabled: cullEnabled,
      frontFace: gl.CW,
      cullFace: cullEnabled ? cullFace : gl.BACK,
    },
    depth: {
      enabled: depthEnabled,
      mask: state.zWriteEnable !== 0,
      func: depthFunc,
    },
    blend: {
      enabled: blendEnabled,
      src: srcBlend,
      dest: destBlend,
      equation: blendEquation,
    },
    alphaTest: {
      enabled: state.alphaTestEnable !== 0,
      func: d3dCmpToGl(state.alphaFunc),
      ref: (state.alphaRef & 0xff) / 255,
    },
    colorWrite: colorMask,
  };
}

function paintD3D8DrawIndexed(payload = {}) {
  const vertexByteSize = Number(payload.vertexBytes ?? 0) >>> 0;
  const indexByteSize = Number(payload.indexBytes ?? 0) >>> 0;
  const vertexBufferId = Number(payload.vertexBufferId ?? 0) >>> 0;
  const indexBufferId = Number(payload.indexBufferId ?? 0) >>> 0;
  const vertexByteOffset = Number(payload.vertexByteOffset ?? 0) >>> 0;
  const indexByteOffset = Number(payload.indexByteOffset ?? 0) >>> 0;
  const vertexStride = Number(payload.vertexStride ?? 0) >>> 0;
  const vertexCount = Number(payload.vertexCount ?? 0) >>> 0;
  const indexSize = Number(payload.indexSize ?? 0) >>> 0;
  const indexCount = Number(payload.indexCount ?? 0) >>> 0;
  const glPrimitive = d3dPrimitiveToGl(payload.primitiveType);
  const vertexResource = d3d8Buffers.get(d3d8BufferKey(1, vertexBufferId));
  const indexResource = d3d8Buffers.get(d3d8BufferKey(2, indexBufferId));
  const usePersistentBuffers = Boolean(vertexResource && indexResource);
  const world = normalizeD3DMatrix(payload.transforms?.world);
  const view = normalizeD3DMatrix(payload.transforms?.view);
  const projection = normalizeD3DMatrix(payload.transforms?.projection);
  const transformMask = Number(payload.transformMask ?? 0) >>> 0;
  const useTransforms = transformMask === 7 && world !== null && view !== null && projection !== null;
  const renderState = normalizeD3D8RenderState(payload.renderState);
  const texture0Id = Number(d3d8BoundTextures.get(0) ?? 0) >>> 0;
  const texture0Resource = texture0Id !== 0 ? d3d8Textures.get(texture0Id) : null;
  const texture0Ready = Boolean(texture0Resource?.initializedLevels?.has("0"));
  const canSampleTexture0 = Boolean(
    texture0Ready && vertexStride >= D3D8_XYZNDUV_TEXCOORD0_MIN_STRIDE
  );
  let appliedRenderState = null;
  let drawOk = false;
  syncCanvasSize();
  let centerPixel = sampleCanvasPixel(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2));

  if (gl && glPrimitive && usePersistentBuffers && vertexByteSize > 0 && indexByteSize > 0 &&
      vertexStride >= 12 && indexCount > 0 && (indexSize === 2 || indexSize === 4)) {
    const bridgeProgram = ensureD3D8DrawProgram();
    gl.useProgram(bridgeProgram.program);
    appliedRenderState = applyD3D8RenderState(renderState);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexResource.buffer);
    gl.enableVertexAttribArray(bridgeProgram.position);
    gl.vertexAttribPointer(bridgeProgram.position, 3, gl.FLOAT, false, vertexStride, vertexByteOffset);
    if (bridgeProgram.diffuse >= 0 && vertexStride >= D3D8_DIFFUSE_MIN_STRIDE) {
      gl.enableVertexAttribArray(bridgeProgram.diffuse);
      gl.vertexAttribPointer(bridgeProgram.diffuse, 4, gl.UNSIGNED_BYTE, true,
        vertexStride, vertexByteOffset + D3D8_DIFFUSE_OFFSET);
    } else if (bridgeProgram.diffuse >= 0) {
      gl.disableVertexAttribArray(bridgeProgram.diffuse);
      gl.vertexAttrib4f(bridgeProgram.diffuse, 1, 1, 1, 1);
    }
    if (bridgeProgram.texCoord0 >= 0 && canSampleTexture0) {
      gl.enableVertexAttribArray(bridgeProgram.texCoord0);
      gl.vertexAttribPointer(bridgeProgram.texCoord0, 2, gl.FLOAT, false,
        vertexStride, vertexByteOffset + D3D8_XYZNDUV_TEXCOORD0_OFFSET);
    } else if (bridgeProgram.texCoord0 >= 0) {
      gl.disableVertexAttribArray(bridgeProgram.texCoord0);
      gl.vertexAttrib2f(bridgeProgram.texCoord0, 0, 0);
    }
    gl.uniform1f(bridgeProgram.scale, 1.0);
    gl.uniform1i(bridgeProgram.useTransforms, useTransforms ? 1 : 0);
    if (useTransforms) {
      // Direct3D stores row-vector matrices row-major; WebGL interprets this
      // memory as column-major, giving the transpose needed for GLSL
      // column-vector multiplication.
      gl.uniformMatrix4fv(bridgeProgram.world, false, world);
      gl.uniformMatrix4fv(bridgeProgram.view, false, view);
      gl.uniformMatrix4fv(bridgeProgram.projection, false, projection);
    }
    if (bridgeProgram.useTexture0) {
      gl.uniform1i(bridgeProgram.useTexture0, canSampleTexture0 ? 1 : 0);
    }
    if (bridgeProgram.texture0) {
      gl.uniform1i(bridgeProgram.texture0, 0);
    }
    if (canSampleTexture0) {
      const previousActiveTexture = gl.getParameter(gl.ACTIVE_TEXTURE);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture0Resource.texture);
      gl.activeTexture(previousActiveTexture);
    }
    if (bridgeProgram.alphaTestEnabled) {
      gl.uniform1i(bridgeProgram.alphaTestEnabled, appliedRenderState.alphaTest.enabled ? 1 : 0);
    }
    if (bridgeProgram.alphaFunc) {
      gl.uniform1i(bridgeProgram.alphaFunc, renderState.alphaFunc);
    }
    if (bridgeProgram.alphaRef) {
      gl.uniform1f(bridgeProgram.alphaRef, appliedRenderState.alphaTest.ref);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexResource.buffer);
    gl.drawElements(glPrimitive, indexCount, indexSize === 4 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, indexByteOffset);
    refreshCanvasState();
    centerPixel = sampleCanvasPixel(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2));
    drawOk = pixelHasColor(centerPixel);
  }

  const probe = {
    ok: drawOk,
    source: "browser_d3d8_draw_indexed",
    api: harnessState.graphics.api,
    primitiveType: Number(payload.primitiveType ?? 0),
    vertexBufferId,
    vertexByteOffset,
    vertexBytes: vertexByteSize,
    vertexCount,
    vertexStride,
    indexBufferId,
    indexByteOffset,
    indexBytes: indexByteSize,
    indexCount,
    indexSize,
    usedPersistentBuffers: usePersistentBuffers,
    transformMask,
    usedTransforms: Boolean(useTransforms),
    renderState,
    appliedRenderState,
    boundTextures: Object.fromEntries(d3d8BoundTextures),
    texture0: {
      id: texture0Id,
      ready: texture0Ready,
      sampled: canSampleTexture0,
      texCoordOffset: canSampleTexture0 ? D3D8_XYZNDUV_TEXCOORD0_OFFSET : null,
      width: texture0Resource?.width ?? 0,
      height: texture0Resource?.height ?? 0,
      format: texture0Resource?.format ?? 0,
      uploads: texture0Resource?.uploads ?? 0,
    },
    centerPixel,
  };
  harnessState.graphics = {
    ...harnessState.graphics,
    lastD3D8DrawIndexed: probe,
  };
  return drawOk ? 1 : 0;
}

function paintBlackWindow() {
  clearCanvas({ rgba: [0, 0, 0, 255] });
}

function syncStatus(label = harnessState.booted ? "booted" : "idle") {
  stateNode.textContent = label;
  framesNode.textContent = String(harnessState.frame);
}

function recordLog(message, data = null) {
  const entry = {
    frame: harnessState.frame,
    message: String(message),
    data,
    time: new Date().toISOString(),
  };
  harnessState.logs.push(entry);
  console.info("[wasm-harness]", entry.message, entry.data ?? "");
  return entry;
}

async function boot(payload = {}) {
  const wasmModule = await wasmModulePromise;
  if (wasmModule) {
    applyModuleState(parseModuleState(wasmModule.boot()));
    harnessState.wasm = "loaded";
  } else {
    harnessState.booted = true;
    harnessState.frame += 1;
    harnessState.wasm = "missing";
  }

  paintBlackWindow();
  syncStatus(`booted (${harnessState.runtime})`);
  recordLog("boot", payload);

  return snapshotState();
}

async function stepFrames(payload = {}) {
  const wasmModule = await wasmModulePromise;
  const requestedCount = Number(payload.count ?? 1);
  const count = Number.isFinite(requestedCount)
    ? Math.max(0, Math.min(600, Math.trunc(requestedCount)))
    : 1;

  for (let i = 0; i < count; ++i) {
    if (wasmModule) {
      applyModuleState(parseModuleState(wasmModule.frame()));
      harnessState.wasm = "loaded";
    } else if (harnessState.booted) {
      harnessState.frame += 1;
      harnessState.wasm = "missing";
    }
  }

  syncStatus(harnessState.booted ? `booted (${harnessState.runtime})` : "idle");
  return snapshotState();
}

function applyModuleState(moduleState) {
  harnessState.booted = Boolean(moduleState.booted);
  harnessState.frame = Number(moduleState.frame ?? harnessState.frame);
  harnessState.runtime = moduleState.module ?? "wasm";
  harnessState.mainLoop = moduleState.mainLoop ?? harnessState.mainLoop;
  harnessState.timing = moduleState.timing ?? harnessState.timing;
  harnessState.win32Timing = moduleState.win32Timing ?? harnessState.win32Timing;
  harnessState.browserInput = moduleState.browserInput ?? harnessState.browserInput;
  harnessState.originalEngineLinked = Boolean(moduleState.originalEngineLinked);
  harnessState.originalCoreProbe = moduleState.originalCoreProbe ?? null;
  harnessState.globalDataProbe = moduleState.globalDataProbe ?? null;
  harnessState.commandLineProbe = moduleState.commandLineProbe ?? null;
  harnessState.cdManagerProbe = moduleState.cdManagerProbe ?? null;
  harnessState.fileSystemProbe = moduleState.fileSystemProbe ?? null;
  harnessState.gameNetworkProbe = moduleState.gameNetworkProbe ?? null;
  harnessState.debugProbe = moduleState.debugProbe ?? null;
  harnessState.commonDebugLog = moduleState.commonDebugLog ?? null;
  harnessState.assetProbe = moduleState.assetProbe ?? null;
  harnessState.archiveMount = moduleState.archiveMount ?? harnessState.archiveMount;
  harnessState.startupAssets = moduleState.startupAssets ?? harnessState.startupAssets;
  harnessState.dataSummary = moduleState.dataSummary ?? harnessState.dataSummary;
  harnessState.originalEngineStartup = moduleState.originalEngineStartup ?? harnessState.originalEngineStartup;
}

async function loadWasmModule() {
  try {
    const moduleExports = await import("../dist/cnc-port.js");
    const createModule = moduleExports.default ?? moduleExports.createCncPortModule;
    const module = await createModule({
      locateFile: (path) => path.endsWith(".wasm") ? `../dist/${path}` : path,
      print: (text) => recordLog("wasm stdout", { text: String(text) }),
      printErr: (text) => recordLog("wasm stderr", { text: String(text) }),
      cncPortD3D8Clear: paintD3D8Clear,
      cncPortD3D8BufferCreate: createD3D8Buffer,
      cncPortD3D8BufferUpdate: updateD3D8Buffer,
      cncPortD3D8BufferRelease: releaseD3D8Buffer,
      cncPortD3D8TextureCreate: createD3D8Texture,
      cncPortD3D8TextureUpdate: updateD3D8Texture,
      cncPortD3D8TextureRelease: releaseD3D8Texture,
      cncPortD3D8TextureBind: bindD3D8Texture,
      cncPortD3D8DrawIndexed: paintD3D8DrawIndexed,
    });

    return {
      boot: module.cwrap("cnc_port_boot", "string", []),
      frame: module.cwrap("cnc_port_frame", "string", []),
      startMainLoop: module.cwrap("cnc_port_start_main_loop", "string", []),
      stopMainLoop: module.cwrap("cnc_port_stop_main_loop", "string", []),
      probeArchive: module.cwrap("cnc_port_probe_archive", "string", ["string"]),
      registerArchiveSet: module.cwrap(
        "cnc_port_register_archive_set",
        "string",
        ["string", "string", "number", "number"],
      ),
      setBrowserInput: module.cwrap(
        "cnc_port_set_browser_input",
        "string",
        ["number", "number", "number", "number", "number"],
      ),
      resetBrowserInput: module.cwrap("cnc_port_reset_browser_input", "string", []),
      postBrowserMessage: module.cwrap(
        "cnc_port_post_browser_message",
        "string",
        ["number", "number", "number", "number", "number"],
      ),
      probeBrowserMessageQueue: module.cwrap("cnc_port_probe_browser_message_queue", "string", []),
      probeBrowserInput: module.cwrap("cnc_port_probe_browser_input", "string", []),
      probeD3D8Clear: module.cwrap("cnc_port_probe_d3d8_clear", "string", ["number"]),
      probeD3D8BufferDirty: module.cwrap("cnc_port_probe_d3d8_buffer_dirty", "string", []),
      probeD3D8BufferHints: module.cwrap("cnc_port_probe_d3d8_buffer_hints", "string", []),
      probeD3D8TextureUpload: module.cwrap("cnc_port_probe_d3d8_texture_upload", "string", []),
      probeD3D8TextureBind: module.cwrap("cnc_port_probe_d3d8_texture_bind", "string", []),
      probeD3D8TexturedQuad: module.cwrap("cnc_port_probe_d3d8_textured_quad", "string", []),
      probeWW3DAABox: module.cwrap("cnc_port_probe_ww3d_aabox", "string", []),
      initOriginalWndProcInput: module.cwrap(
        "cnc_port_init_original_wndproc_input",
        "string",
        ["number", "number"],
      ),
      pumpOriginalWndProcInput: module.cwrap("cnc_port_pump_original_wndproc_input", "string", []),
      probeOriginalWndProcInput: module.cwrap("cnc_port_probe_original_wndproc_input", "string", []),
      state: module.cwrap("cnc_port_state", "string", []),
      fs: module.FS,
    };
  } catch (error) {
    console.info("[wasm-harness] wasm module unavailable; using JS boot stub", error);
    return null;
  }
}

function parseModuleState(stateJson) {
  try {
    return JSON.parse(stateJson);
  } catch {
    throw new Error(`Invalid wasm state JSON: ${stateJson}`);
  }
}

function snapshotCanvas() {
  syncCanvasSize();
  return {
    width: canvas.width,
    height: canvas.height,
    topLeftPixel: sampleCanvasPixel(0, 0),
    centerPixel: sampleCanvasPixel(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2)),
    dataUrl: canvas.toDataURL("image/png"),
  };
}

function snapshotState() {
  syncCanvasSize();
  return {
    booted: harnessState.booted,
    frame: harnessState.frame,
    runtime: harnessState.runtime,
    wasm: harnessState.wasm,
    mainLoop: harnessState.mainLoop,
    timing: harnessState.timing,
    win32Timing: harnessState.win32Timing,
    canvas: harnessState.canvas,
    graphics: harnessState.graphics,
    browserInput: harnessState.browserInput,
    originalEngineLinked: harnessState.originalEngineLinked,
    originalCoreProbe: harnessState.originalCoreProbe,
    globalDataProbe: harnessState.globalDataProbe,
    commandLineProbe: harnessState.commandLineProbe,
    cdManagerProbe: harnessState.cdManagerProbe,
    fileSystemProbe: harnessState.fileSystemProbe,
    gameNetworkProbe: harnessState.gameNetworkProbe,
    debugProbe: harnessState.debugProbe,
    commonDebugLog: harnessState.commonDebugLog,
    assetProbe: harnessState.assetProbe,
    archiveMount: harnessState.archiveMount,
    startupAssets: harnessState.startupAssets,
    dataSummary: harnessState.dataSummary,
    originalEngineStartup: harnessState.originalEngineStartup,
    originalWndProcInput: harnessState.originalWndProcInput,
    mountedArchives: harnessState.mountedArchives,
    logCount: harnessState.logs.length,
  };
}

function normalizeAssetParts(path) {
  const rawPath = String(path);
  const parts = [];
  for (const part of rawPath.split("/")) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      return null;
    }
    parts.push(part);
  }

  return rawPath.startsWith("/assets")
    && parts[0] === "assets"
    ? parts
    : null;
}

function normalizeAssetDirectory(path) {
  const parts = normalizeAssetParts(path);
  return parts && parts.length >= 1 ? `/${parts.join("/")}` : null;
}

function normalizeAssetPath(path) {
  const parts = normalizeAssetParts(path);
  return parts && parts[0] === "assets" && parts.length > 1 ? `/${parts.join("/")}` : null;
}

function ensureMemfsDirectory(fs, path) {
  const directory = normalizeAssetDirectory(path);
  if (!directory) {
    throw new Error(`MEMFS directory must stay under /assets: ${path}`);
  }

  let current = "";
  for (const part of directory.split("/").filter(Boolean)) {
    current += `/${part}`;
    try {
      fs.mkdir(current);
    } catch {
      // Existing directories are fine; a later write/probe will surface real failures.
    }
  }
}

function archiveNameFromUrl(url) {
  const parsed = new URL(url, window.location.href);
  const parts = parsed.pathname.split("/").filter(Boolean);
  return parts[parts.length - 1] || "archive.big";
}

function parentDirectory(path) {
  const slash = path.lastIndexOf("/");
  return slash > 0 ? path.slice(0, slash) : "/";
}

function archivePathFromPayload(payload, baseDirectory = "/assets") {
  const url = String(payload.url ?? "");
  if (!url) {
    return { error: "Missing archive URL" };
  }

  const name = String(payload.name ?? archiveNameFromUrl(url));
  const requestedMemfsPath = String(payload.path ?? `${baseDirectory}/${name}`);
  const memfsPath = normalizeAssetPath(requestedMemfsPath);
  if (!memfsPath) {
    return { error: `Archive path must stay under /assets/: ${requestedMemfsPath}` };
  }

  return { url, name, memfsPath };
}

async function writeArchiveToMemfs(wasmModule, payload, baseDirectory = "/assets") {
  const archive = archivePathFromPayload(payload, baseDirectory);
  if (archive.error) {
    return archive;
  }

  const response = await fetch(archive.url);
  if (!response.ok) {
    return {
      error: `${archive.name} fetch failed: ${response.status} ${response.statusText}`,
    };
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  ensureMemfsDirectory(wasmModule.fs, parentDirectory(archive.memfsPath));
  wasmModule.fs.writeFile(archive.memfsPath, bytes);

  return {
    name: archive.name,
    path: archive.memfsPath,
    bytes: bytes.byteLength,
  };
}

function probeArchive(wasmModule, archivePath) {
  applyModuleState(parseModuleState(wasmModule.probeArchive(archivePath)));
  harnessState.wasm = "loaded";
  return harnessState.assetProbe;
}

function registerArchiveSet(wasmModule, archiveSet) {
  const directory = archiveSet.path.endsWith("/") ? archiveSet.path : `${archiveSet.path}/`;
  const fileMask = archiveSet.probePath.slice(archiveSet.probePath.lastIndexOf("/") + 1) || "*.big";
  applyModuleState(parseModuleState(wasmModule.registerArchiveSet(
    directory,
    fileMask,
    archiveSet.archiveCount,
    archiveSet.totalBytes,
  )));
  harnessState.wasm = "loaded";
  return harnessState.archiveMount;
}

function virtualKeyFromEvent(event) {
  const code = String(event.code ?? "");
  const namedKeys = {
    Backspace: 0x08,
    Tab: 0x09,
    Enter: 0x0d,
    ShiftLeft: 0x10,
    ShiftRight: 0x10,
    ControlLeft: 0x11,
    ControlRight: 0x11,
    AltLeft: 0x12,
    AltRight: 0x12,
    Escape: 0x1b,
    Space: 0x20,
    Insert: 0x2d,
    Delete: 0x2e,
    ArrowLeft: 0x25,
    ArrowUp: 0x26,
    ArrowRight: 0x27,
    ArrowDown: 0x28,
    F5: 0x74,
    F6: 0x75,
    F7: 0x76,
    F8: 0x77,
    F9: 0x78,
    F10: 0x79,
    F11: 0x7a,
    F12: 0x7b,
  };
  if (Object.prototype.hasOwnProperty.call(namedKeys, code)) {
    return namedKeys[code];
  }
  if (/^Key[A-Z]$/.test(code)) {
    return code.charCodeAt(3);
  }
  if (/^Digit[0-9]$/.test(code)) {
    return code.charCodeAt(5);
  }
  return -1;
}

const win32Messages = Object.freeze({
  activate: 0x0006,
  setFocus: 0x0007,
  killFocus: 0x0008,
  activateApp: 0x001c,
  keyDown: 0x0100,
  keyUp: 0x0101,
  char: 0x0102,
  imeStartComposition: 0x010d,
  imeEndComposition: 0x010e,
  imeComposition: 0x010f,
  mouseMove: 0x0200,
  leftButtonDown: 0x0201,
  leftButtonUp: 0x0202,
  leftButtonDoubleClick: 0x0203,
  rightButtonDown: 0x0204,
  rightButtonUp: 0x0205,
  rightButtonDoubleClick: 0x0206,
  middleButtonDown: 0x0207,
  middleButtonUp: 0x0208,
  middleButtonDoubleClick: 0x0209,
  mouseWheel: 0x020a,
});

const win32ActivateStates = Object.freeze({
  inactive: 0,
  active: 1,
});

const win32ImeCompositionFlags = Object.freeze({
  compositionString: 0x0008,
  resultString: 0x0800,
});

const doubleClickPolicy = Object.freeze({
  timeMs: 500,
  maxDistance: 4,
});

const doubleClickButtons = new Map([
  [0, {
    down: win32Messages.leftButtonDown,
    up: win32Messages.leftButtonUp,
    doubleClick: win32Messages.leftButtonDoubleClick,
  }],
  [1, {
    down: win32Messages.middleButtonDown,
    up: win32Messages.middleButtonUp,
    doubleClick: win32Messages.middleButtonDoubleClick,
  }],
  [2, {
    down: win32Messages.rightButtonDown,
    up: win32Messages.rightButtonUp,
    doubleClick: win32Messages.rightButtonDoubleClick,
  }],
]);

const doubleClickStateByButton = new Map();
let browserWin32Focused = false;

function canvasInputPointFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
  const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
  const x = Math.max(0, Math.min(canvas.width - 1, Math.round((event.clientX - rect.left) * scaleX)));
  const y = Math.max(0, Math.min(canvas.height - 1, Math.round((event.clientY - rect.top) * scaleY)));
  return { x, y };
}

function win32PointLParam(point) {
  return ((point.y & 0xffff) << 16) | (point.x & 0xffff);
}

function eventTimestampMs(event) {
  return Number.isFinite(event.timeStamp) ? event.timeStamp : performance.now();
}

function doubleClickStateForButton(button) {
  let state = doubleClickStateByButton.get(button);
  if (!state) {
    state = {
      lastUpTimeMs: Number.NEGATIVE_INFINITY,
      lastPoint: null,
      currentDownWasDoubleClick: false,
    };
    doubleClickStateByButton.set(button, state);
  }
  return state;
}

function isDoubleClickPointerDown(event, point) {
  if (!doubleClickButtons.has(event.button)) {
    return false;
  }
  const state = doubleClickStateForButton(event.button);
  if (!state.lastPoint) {
    return false;
  }
  const elapsedMs = eventTimestampMs(event) - state.lastUpTimeMs;
  const deltaX = point.x - state.lastPoint.x;
  const deltaY = point.y - state.lastPoint.y;
  return elapsedMs >= 0
    && elapsedMs <= doubleClickPolicy.timeMs
    && Math.abs(deltaX) <= doubleClickPolicy.maxDistance
    && Math.abs(deltaY) <= doubleClickPolicy.maxDistance;
}

function mouseButtonMessage(event, isDown, point) {
  const messages = doubleClickButtons.get(event.button);
  if (!messages) {
    return -1;
  }
  if (!isDown) {
    return messages.up;
  }

  const state = doubleClickStateForButton(event.button);
  state.currentDownWasDoubleClick = isDoubleClickPointerDown(event, point);
  return state.currentDownWasDoubleClick ? messages.doubleClick : messages.down;
}

function rememberPointerUpForDoubleClick(event, point) {
  if (!doubleClickButtons.has(event.button)) {
    return;
  }

  const state = doubleClickStateForButton(event.button);
  if (state.currentDownWasDoubleClick) {
    state.lastUpTimeMs = Number.NEGATIVE_INFINITY;
    state.lastPoint = null;
    state.currentDownWasDoubleClick = false;
    return;
  }

  state.lastUpTimeMs = eventTimestampMs(event);
  state.lastPoint = { x: point.x, y: point.y };
}

function resetDoubleClickState() {
  doubleClickStateByButton.clear();
}

function wheelWParam(event) {
  const delta = event.deltaY > 0 ? -120 : 120;
  return (delta & 0xffff) << 16;
}

function win32CharCodeFromEvent(event) {
  if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) {
    return -1;
  }
  if (typeof event.key !== "string" || event.key.length !== 1) {
    return -1;
  }
  return event.key.charCodeAt(0);
}

function lastUtf16CodeUnit(text) {
  if (typeof text !== "string" || text.length === 0) {
    return 0;
  }
  return text.charCodeAt(text.length - 1);
}

async function pushBrowserInputToWasm({
  cursor = null,
  virtualKey = -1,
  keyDown = false,
  win32Message = null,
} = {}) {
  const wasmModule = await wasmModulePromise;
  if (!wasmModule) {
    return null;
  }

  const cursorAvailable = cursor ? 1 : 0;
  let stateJson = wasmModule.setBrowserInput(
    cursor?.x ?? 0,
    cursor?.y ?? 0,
    cursorAvailable,
    virtualKey,
    keyDown ? 1 : 0,
  );
  if (win32Message) {
    stateJson = wasmModule.postBrowserMessage(
      win32Message.message,
      win32Message.wParam ?? 0,
      win32Message.lParam ?? 0,
      win32Message.point?.x ?? cursor?.x ?? 0,
      win32Message.point?.y ?? cursor?.y ?? 0,
    );
  }
  applyModuleState(parseModuleState(stateJson));
  harnessState.wasm = "loaded";
  return snapshotState();
}

async function postBrowserMessageToWasm({
  message,
  wParam = 0,
  lParam = 0,
  point = null,
} = {}) {
  const wasmModule = await wasmModulePromise;
  if (!wasmModule) {
    return null;
  }

  applyModuleState(parseModuleState(wasmModule.postBrowserMessage(
    Number(message),
    Number(wParam),
    Number(lParam),
    point?.x ?? 0,
    point?.y ?? 0,
  )));
  harnessState.wasm = "loaded";
  return snapshotState();
}

async function postBrowserTextToWasm(text) {
  if (typeof text !== "string" || text.length === 0) {
    return snapshotState();
  }

  let state = null;
  for (let index = 0; index < text.length; ++index) {
    state = await postBrowserMessageToWasm({
      message: win32Messages.char,
      wParam: text.charCodeAt(index),
    });
    if (!state) {
      return null;
    }
  }
  return state;
}

async function resetBrowserInput() {
  const wasmModule = await wasmModulePromise;
  if (!wasmModule) {
    return null;
  }
  resetDoubleClickState();
  applyModuleState(parseModuleState(wasmModule.resetBrowserInput()));
  harnessState.wasm = "loaded";
  return snapshotState();
}

async function setBrowserWin32Focus(active) {
  if (browserWin32Focused === active) {
    return snapshotState();
  }

  browserWin32Focused = active;
  if (!active) {
    const resetState = await resetBrowserInput();
    if (!resetState) {
      return null;
    }
  }

  const messages = active ? [
    { message: win32Messages.activateApp, wParam: 1 },
    { message: win32Messages.activate, wParam: win32ActivateStates.active },
    { message: win32Messages.setFocus },
  ] : [
    { message: win32Messages.killFocus },
    { message: win32Messages.activate, wParam: win32ActivateStates.inactive },
    { message: win32Messages.activateApp, wParam: 0 },
  ];

  let state = null;
  for (const message of messages) {
    state = await postBrowserMessageToWasm(message);
    if (!state) {
      return null;
    }
  }
  return state;
}

async function probeBrowserMessageQueue() {
  const wasmModule = await wasmModulePromise;
  if (!wasmModule) {
    return null;
  }
  const probe = parseModuleState(wasmModule.probeBrowserMessageQueue());
  applyModuleState(parseModuleState(wasmModule.state()));
  harnessState.wasm = "loaded";
  return probe;
}

async function probeBrowserInput() {
  const wasmModule = await wasmModulePromise;
  if (!wasmModule) {
    return null;
  }
  const probe = parseModuleState(wasmModule.probeBrowserInput());
  applyModuleState(parseModuleState(wasmModule.state()));
  harnessState.wasm = "loaded";
  return probe;
}

async function initOriginalWndProcInput(payload = {}) {
  const wasmModule = await wasmModulePromise;
  if (!wasmModule) {
    return null;
  }

  const width = Number(payload.width ?? canvas.width);
  const height = Number(payload.height ?? canvas.height);
  const probe = parseModuleState(wasmModule.initOriginalWndProcInput(width, height));
  harnessState.originalWndProcInput = probe;
  harnessState.wasm = "loaded";
  return probe;
}

async function pumpOriginalWndProcInput() {
  const wasmModule = await wasmModulePromise;
  if (!wasmModule) {
    return null;
  }

  const probe = parseModuleState(wasmModule.pumpOriginalWndProcInput());
  harnessState.originalWndProcInput = probe;
  applyModuleState(parseModuleState(wasmModule.state()));
  harnessState.wasm = "loaded";
  return probe;
}

async function probeOriginalWndProcInput() {
  const wasmModule = await wasmModulePromise;
  if (!wasmModule) {
    return null;
  }

  const probe = parseModuleState(wasmModule.probeOriginalWndProcInput());
  harnessState.originalWndProcInput = probe;
  applyModuleState(parseModuleState(wasmModule.state()));
  harnessState.wasm = "loaded";
  return probe;
}

function rememberMountedArchives(archives) {
  const byPath = new Map(harnessState.mountedArchives.map((archive) => [archive.path, archive]));
  for (const archive of archives) {
    byPath.set(archive.path, archive);
  }
  harnessState.mountedArchives = Array.from(byPath.values()).sort((left, right) =>
    left.path.localeCompare(right.path));
}

async function getWasmModuleForArchives(command) {
  const wasmModule = await wasmModulePromise;
  if (!wasmModule) {
    return { error: "Wasm module unavailable; archive cannot be mounted", command };
  }
  return { wasmModule };
}

async function mountArchive(payload = {}) {
  const moduleResult = await getWasmModuleForArchives("mountArchive");
  if (moduleResult.error) {
    return { ok: false, command: moduleResult.command, error: moduleResult.error };
  }

  const archive = await writeArchiveToMemfs(moduleResult.wasmModule, payload);
  if (archive.error) {
    return { ok: false, command: "mountArchive", error: archive.error };
  }

  probeArchive(moduleResult.wasmModule, archive.path);
  rememberMountedArchives([archive]);
  recordLog("archive mounted", {
    path: archive.path,
    bytes: archive.bytes,
    ok: Boolean(harnessState.assetProbe?.ok),
  });

  return {
    ok: Boolean(harnessState.assetProbe?.ok),
    command: "mountArchive",
    state: snapshotState(),
    archive,
  };
}

async function mountArchives(payload = {}) {
  const moduleResult = await getWasmModuleForArchives("mountArchives");
  if (moduleResult.error) {
    return { ok: false, command: moduleResult.command, error: moduleResult.error };
  }

  const archiveInputs = Array.isArray(payload.archives) ? payload.archives : [];
  if (archiveInputs.length === 0) {
    return { ok: false, command: "mountArchives", error: "Missing archive list" };
  }

  const baseDirectory = normalizeAssetDirectory(String(payload.path ?? "/assets/runtime"));
  if (!baseDirectory) {
    return { ok: false, command: "mountArchives", error: `Archive directory must stay under /assets/: ${payload.path}` };
  }

  const archives = [];
  const archiveProbes = [];
  for (const input of archiveInputs) {
    const archive = await writeArchiveToMemfs(moduleResult.wasmModule, input, baseDirectory);
    if (archive.error) {
      return { ok: false, command: "mountArchives", error: archive.error, archives };
    }

    const expectedBytes = Number(input.expectedBytes ?? input.bytes ?? archive.bytes);
    const assetProbe = payload.verifyEach === false
      ? null
      : probeArchive(moduleResult.wasmModule, archive.path);
    archives.push({
      ...archive,
      expectedBytes,
      bytesMatch: archive.bytes === expectedBytes,
    });
    if (assetProbe) {
      archiveProbes.push({
        name: archive.name,
        path: archive.path,
        ok: Boolean(assetProbe.ok),
        indexedFiles: assetProbe.indexedFiles,
        sampleBytes: assetProbe.sampleBytes,
      });
    }
  }

  const probePath = `${baseDirectory}/*.big`;
  const aggregateProbe = probeArchive(moduleResult.wasmModule, probePath);
  rememberMountedArchives(archives);

  const allArchiveBytesMatch = archives.every((archive) => archive.bytesMatch);
  const allArchiveProbesOk = archiveProbes.every((archive) => archive.ok);
  const ok = Boolean(aggregateProbe?.ok) && allArchiveBytesMatch && allArchiveProbesOk;
  const totalBytes = archives.reduce((sum, archive) => sum + archive.bytes, 0);
  const archiveSet = {
    path: baseDirectory,
    probePath,
    archiveCount: archives.length,
    totalBytes,
    archives,
    probes: archiveProbes,
  };
  if (ok) {
    registerArchiveSet(moduleResult.wasmModule, archiveSet);
  }

  recordLog("archive set mounted", {
    path: baseDirectory,
    archiveCount: archives.length,
    totalBytes,
    ok,
  });

  return {
    ok,
    command: "mountArchives",
    state: snapshotState(),
    archiveSet,
  };
}

async function rpc(command, payload = {}) {
  switch (command) {
    case "boot":
      return { ok: true, command, state: await boot(payload) };
    case "frame":
      return { ok: true, command, state: await stepFrames(payload) };
    case "mountArchive":
      return mountArchive(payload);
    case "mountArchives":
      return mountArchives(payload);
    case "startMainLoop":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; Emscripten main loop cannot start" };
        }
        applyModuleState(parseModuleState(wasmModule.startMainLoop()));
        harnessState.wasm = "loaded";
        syncStatus(`booted (${harnessState.runtime})`);
        return { ok: true, command, state: snapshotState() };
      }
    case "stopMainLoop":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; Emscripten main loop cannot stop" };
        }
        applyModuleState(parseModuleState(wasmModule.stopMainLoop()));
        harnessState.wasm = "loaded";
        syncStatus(`booted (${harnessState.runtime})`);
        return { ok: true, command, state: snapshotState() };
      }
    case "setInput":
      {
        const state = await pushBrowserInputToWasm({
          cursor: payload.cursor ?? null,
          virtualKey: Number.isFinite(Number(payload.virtualKey)) ? Number(payload.virtualKey) : -1,
          keyDown: Boolean(payload.keyDown),
        });
        if (!state) {
          return { ok: false, command, error: "Wasm module unavailable; browser input cannot be updated" };
        }
        return { ok: true, command, state };
      }
    case "resetInput":
      {
        const state = await resetBrowserInput();
        if (!state) {
          return { ok: false, command, error: "Wasm module unavailable; browser input cannot be reset" };
        }
        return { ok: true, command, state };
      }
    case "postMessage":
      {
        const state = await postBrowserMessageToWasm({
          message: Number(payload.message),
          wParam: Number(payload.wParam ?? 0),
          lParam: Number(payload.lParam ?? 0),
          point: payload.point ?? null,
        });
        if (!state) {
          return { ok: false, command, error: "Wasm module unavailable; browser message cannot be posted" };
        }
        return { ok: true, command, state };
      }
    case "messageQueueProbe":
      {
        const probe = await probeBrowserMessageQueue();
        if (!probe) {
          return { ok: false, command, error: "Wasm module unavailable; browser message queue cannot be probed" };
        }
        return { ok: true, command, probe, state: snapshotState() };
      }
    case "inputProbe":
      {
        const probe = await probeBrowserInput();
        if (!probe) {
          return { ok: false, command, error: "Wasm module unavailable; browser input cannot be probed" };
        }
        return { ok: true, command, probe, state: snapshotState() };
      }
    case "initOriginalWndProcInput":
      {
        const probe = await initOriginalWndProcInput(payload);
        if (!probe) {
          return { ok: false, command, error: "Wasm module unavailable; original WndProc input cannot initialize" };
        }
        return { ok: true, command, probe, state: snapshotState() };
      }
    case "pumpOriginalWndProcInput":
      {
        const probe = await pumpOriginalWndProcInput();
        if (!probe) {
          return { ok: false, command, error: "Wasm module unavailable; original WndProc input cannot pump" };
        }
        return { ok: true, command, probe, state: snapshotState() };
      }
    case "originalWndProcInputProbe":
      {
        const probe = await probeOriginalWndProcInput();
        if (!probe) {
          return { ok: false, command, error: "Wasm module unavailable; original WndProc input cannot be probed" };
        }
        return { ok: true, command, probe, state: snapshotState() };
      }
    case "log":
      return { ok: true, command, entry: recordLog(payload.message ?? "", payload.data ?? null) };
    case "clearCanvas":
      {
        const probe = clearCanvas(payload);
        return { ok: probe.ok, command, probe, state: snapshotState() };
      }
    case "d3d8Clear":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 clear cannot run" };
        }
        const rgba = normalizeRgba(payload);
        const clearColor = d3dColorFromRgba(rgba);
        const probe = parseModuleState(wasmModule.probeD3D8Clear(clearColor));
        const screenshot = snapshotCanvas();
        const browserProbe = harnessState.graphics.lastD3D8Clear ?? null;
        const ok = Boolean(probe.ok)
          && Boolean(browserProbe?.ok)
          && browserProbe.clearColor?.join(",") === rgba.join(",")
          && screenshot.topLeftPixel.join(",") === rgba.join(",");
        return {
          ok,
          command,
          probe,
          browserProbe,
          screenshot,
          state: snapshotState(),
        };
      }
    case "d3d8BufferDirty":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 buffer dirty probe cannot run" };
        }
        const probe = parseModuleState(wasmModule.probeD3D8BufferDirty());
        const browserProbe = harnessState.graphics.d3d8Buffers ?? null;
        const ok = Boolean(probe.ok)
          && browserProbe?.lastUpdate?.byteOffset === probe.indexUpdate?.offset
          && browserProbe?.lastUpdate?.byteSize === probe.indexUpdate?.bytes
          && browserProbe?.releases >= 2
          && browserProbe?.liveVertex === 0
          && browserProbe?.liveIndex === 0;
        return {
          ok,
          command,
          probe,
          browserProbe,
          state: snapshotState(),
        };
      }
    case "d3d8BufferHints":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 buffer hint probe cannot run" };
        }
        const probe = parseModuleState(wasmModule.probeD3D8BufferHints());
        const browserProbe = harnessState.graphics.d3d8Buffers ?? null;
        const ok = Boolean(probe.ok)
          && browserProbe?.lastCreate?.dynamic === true
          && browserProbe?.lastCreate?.glUsage === "streamDraw"
          && browserProbe?.lastStaticCreate?.dynamic === false
          && browserProbe?.lastStaticCreate?.writeOnly === true
          && browserProbe?.lastStaticCreate?.glUsage === "staticDraw"
          && browserProbe?.lastDynamicCreate?.dynamic === true
          && browserProbe?.lastDynamicCreate?.glUsage === "streamDraw"
          && browserProbe?.lastUpdate?.glUsage === "streamDraw"
          && browserProbe?.lastUpdate?.discard === true
          && browserProbe?.lastUpdate?.noOverwrite === false
          && browserProbe?.lastUpdate?.orphaned === true
          && browserProbe?.lastUpdate?.byteOffset === probe.dynamicUpdate?.offset
          && browserProbe?.lastUpdate?.byteSize === probe.dynamicUpdate?.bytes
          && browserProbe?.lastUpdate?.d3dUsage === probe.dynamicUpdate?.usage
          && browserProbe?.lastUpdate?.lockFlags === probe.dynamicUpdate?.lockFlags
          && browserProbe?.releases >= 2
          && browserProbe?.liveVertex === 0
          && browserProbe?.liveIndex === 0;
        return {
          ok,
          command,
          probe,
          browserProbe,
          state: snapshotState(),
        };
      }
    case "d3d8TextureUpload":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 texture upload probe cannot run" };
        }
        const probe = parseModuleState(wasmModule.probeD3D8TextureUpload());
        const browserProbe = harnessState.graphics.d3d8Textures ?? null;
        const ok = Boolean(probe.ok)
          && browserProbe?.updates >= 3
          && browserProbe?.releases >= 2
          && browserProbe?.live === 0
          && browserProbe?.lastSubrectUpdate?.x === 1
          && browserProbe?.lastSubrectUpdate?.y === 2
          && browserProbe?.lastSubrectUpdate?.width === 1
          && browserProbe?.lastSubrectUpdate?.height === 1
          && browserProbe?.lastSubrectUpdate?.samplePixel?.join(",") === "48,32,16,64"
          && browserProbe?.lastUpdate?.format === 22
          && browserProbe?.lastUpdate?.samplePixel?.join(",") === "7,6,5,255";
        return {
          ok,
          command,
          probe,
          browserProbe,
          state: snapshotState(),
        };
      }
    case "d3d8TextureBind":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 texture bind probe cannot run" };
        }
        const before = harnessState.graphics.d3d8Textures ?? {};
        const probe = parseModuleState(wasmModule.probeD3D8TextureBind());
        const browserProbe = harnessState.graphics.d3d8Textures ?? null;
        const delta = {
          binds: (browserProbe?.binds ?? 0) - (before.binds ?? 0),
          unbinds: (browserProbe?.unbinds ?? 0) - (before.unbinds ?? 0),
          releaseUnbinds: (browserProbe?.releaseUnbinds ?? 0) - (before.releaseUnbinds ?? 0),
          missingBinds: (browserProbe?.missingBinds ?? 0) - (before.missingBinds ?? 0),
          releases: (browserProbe?.releases ?? 0) - (before.releases ?? 0),
        };
        const ok = Boolean(probe.ok)
          && probe.calls?.setTexture === 3
          && probe.calls?.browserTextureBind === 3
          && delta.binds === 2
          && delta.unbinds === 1
          && delta.releaseUnbinds === 1
          && delta.missingBinds === 0
          && delta.releases === 1
          && browserProbe?.lastBind?.stage === 0
          && browserProbe?.lastBind?.id === 0
          && browserProbe?.lastBind?.nullBind === true
          && browserProbe?.lastReleaseUnbind?.id === probe.texture?.id
          && browserProbe?.lastReleaseUnbind?.stages?.join(",") === "1"
          && Object.keys(browserProbe?.boundTextures ?? {}).length === 0
          && browserProbe?.live === 0;
        return {
          ok,
          command,
          probe,
          browserProbe,
          browserDelta: delta,
          state: snapshotState(),
        };
      }
    case "d3d8TexturedQuad":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 textured quad probe cannot run" };
        }
        const beforeTextures = harnessState.graphics.d3d8Textures ?? {};
        const probe = parseModuleState(wasmModule.probeD3D8TexturedQuad());
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const textureProbe = harnessState.graphics.d3d8Textures ?? null;
        const textureDelta = {
          creates: (textureProbe?.creates ?? 0) - (beforeTextures.creates ?? 0),
          updates: (textureProbe?.updates ?? 0) - (beforeTextures.updates ?? 0),
          binds: (textureProbe?.binds ?? 0) - (beforeTextures.binds ?? 0),
          releaseUnbinds: (textureProbe?.releaseUnbinds ?? 0) - (beforeTextures.releaseUnbinds ?? 0),
          releases: (textureProbe?.releases ?? 0) - (beforeTextures.releases ?? 0),
        };
        const ok = Boolean(probe.ok)
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && probe.calls?.setTextureStageState === 11
          && probe.draw?.renderState?.textureStages?.[0]?.colorOp === D3DTOP_MODULATE
          && probe.draw?.renderState?.textureStages?.[0]?.colorArg1 === D3DTA_TEXTURE
          && probe.draw?.renderState?.textureStages?.[0]?.colorArg2 === D3DTA_DIFFUSE
          && probe.draw?.renderState?.textureStages?.[0]?.minFilter === D3DTEXF_LINEAR
          && probe.draw?.renderState?.textureStages?.[0]?.magFilter === D3DTEXF_POINT
          && probe.draw?.renderState?.textureStages?.[0]?.mipFilter === D3DTEXF_NONE
          && probe.draw?.renderState?.textureStages?.[0]?.addressU === D3DTADDRESS_CLAMP
          && probe.draw?.renderState?.textureStages?.[0]?.addressV === D3DTADDRESS_WRAP
          && probe.draw?.renderState?.textureStages?.[1]?.colorOp === D3DTOP_DISABLE
          && probe.draw?.renderState?.textureStages?.[1]?.texCoordIndex === 1
          && browserProbe?.renderState?.textureStages?.[0]?.colorOp === D3DTOP_MODULATE
          && browserProbe?.renderState?.textureStages?.[0]?.colorArg1 === D3DTA_TEXTURE
          && browserProbe?.renderState?.textureStages?.[0]?.colorArg2 === D3DTA_DIFFUSE
          && browserProbe?.renderState?.textureStages?.[0]?.minFilter === D3DTEXF_LINEAR
          && browserProbe?.renderState?.textureStages?.[0]?.magFilter === D3DTEXF_POINT
          && browserProbe?.renderState?.textureStages?.[0]?.mipFilter === D3DTEXF_NONE
          && browserProbe?.renderState?.textureStages?.[0]?.addressU === D3DTADDRESS_CLAMP
          && browserProbe?.renderState?.textureStages?.[0]?.addressV === D3DTADDRESS_WRAP
          && browserProbe?.renderState?.textureStages?.[1]?.colorOp === D3DTOP_DISABLE
          && browserProbe?.renderState?.textureStages?.[1]?.texCoordIndex === 1
          && browserProbe?.texture0?.id === probe.texture?.id
          && browserProbe?.texture0?.ready === true
          && browserProbe?.texture0?.sampled === true
          && browserProbe?.texture0?.texCoordOffset === D3D8_XYZNDUV_TEXCOORD0_OFFSET
          && browserProbe?.texture0?.format === D3DFMT_A8R8G8B8
          && browserProbe?.boundTextures?.["0"] === probe.texture?.id
          && pixelLooksRed(browserProbe?.centerPixel)
          && textureDelta.creates === 1
          && textureDelta.updates === 1
          && textureDelta.binds === 1
          && textureDelta.releaseUnbinds === 1
          && textureDelta.releases === 1
          && textureProbe?.live === 0
          && Object.keys(textureProbe?.boundTextures ?? {}).length === 0;
        return {
          ok,
          command,
          probe,
          browserProbe,
          textureProbe,
          textureDelta,
          state: snapshotState(),
        };
      }
    case "ww3dAABox":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; WW3D AABox cannot render" };
        }
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          lastD3D8DrawIndexed: null,
        };
        const probe = parseModuleState(wasmModule.probeWW3DAABox());
        const screenshot = snapshotCanvas();
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const ok = Boolean(probe.ok)
          && Boolean(browserProbe?.ok)
          && pixelHasColor(browserProbe.centerPixel)
          && pixelHasColor(screenshot.centerPixel);
        return {
          ok,
          command,
          probe,
          browserProbe,
          screenshot,
          state: snapshotState(),
        };
      }
    case "screenshot":
      return { ok: true, command, screenshot: snapshotCanvas() };
    case "state":
      {
        const wasmModule = await wasmModulePromise;
        if (wasmModule) {
          applyModuleState(parseModuleState(wasmModule.state()));
          harnessState.wasm = "loaded";
          syncStatus(harnessState.booted ? `booted (${harnessState.runtime})` : "idle");
        }
      }
      return { ok: true, command, state: snapshotState(), logs: [...harnessState.logs] };
    default:
      return { ok: false, command, error: `Unknown harness command: ${command}` };
  }
}

paintBlackWindow();
syncStatus();

if (window.ResizeObserver) {
  const resizeObserver = new ResizeObserver(() => paintBlackWindow());
  resizeObserver.observe(canvas);
} else {
  window.addEventListener("resize", () => paintBlackWindow());
}

canvas.tabIndex = 0;
canvas.addEventListener("focus", () => {
  void setBrowserWin32Focus(true);
});
canvas.addEventListener("blur", () => {
  void setBrowserWin32Focus(false);
});
canvas.addEventListener("compositionstart", () => {
  void postBrowserMessageToWasm({
    message: win32Messages.imeStartComposition,
  });
});
canvas.addEventListener("compositionupdate", (event) => {
  void postBrowserMessageToWasm({
    message: win32Messages.imeComposition,
    wParam: lastUtf16CodeUnit(event.data),
    lParam: win32ImeCompositionFlags.compositionString,
  });
});
canvas.addEventListener("compositionend", async (event) => {
  const text = typeof event.data === "string" ? event.data : "";
  if (text.length > 0) {
    const compositionState = await postBrowserMessageToWasm({
      message: win32Messages.imeComposition,
      wParam: lastUtf16CodeUnit(text),
      lParam: win32ImeCompositionFlags.resultString,
    });
    if (!compositionState) {
      return;
    }
  }

  const endState = await postBrowserMessageToWasm({
    message: win32Messages.imeEndComposition,
  });
  if (!endState) {
    return;
  }

  await postBrowserTextToWasm(text);
});
canvas.addEventListener("pointermove", (event) => {
  const point = canvasInputPointFromEvent(event);
  void pushBrowserInputToWasm({
    cursor: point,
    win32Message: {
      message: win32Messages.mouseMove,
      lParam: win32PointLParam(point),
      point,
    },
  });
});
canvas.addEventListener("pointerdown", (event) => {
  canvas.focus();
  const point = canvasInputPointFromEvent(event);
  const message = mouseButtonMessage(event, true, point);
  event.preventDefault();
  void pushBrowserInputToWasm({
    cursor: point,
    win32Message: message >= 0 ? {
      message,
      lParam: win32PointLParam(point),
      point,
    } : null,
  });
});
canvas.addEventListener("pointerup", (event) => {
  const point = canvasInputPointFromEvent(event);
  const message = mouseButtonMessage(event, false, point);
  rememberPointerUpForDoubleClick(event, point);
  event.preventDefault();
  void pushBrowserInputToWasm({
    cursor: point,
    win32Message: message >= 0 ? {
      message,
      lParam: win32PointLParam(point),
      point,
    } : null,
  });
});
canvas.addEventListener("wheel", (event) => {
  const point = canvasInputPointFromEvent(event);
  event.preventDefault();
  void pushBrowserInputToWasm({
    cursor: point,
    win32Message: {
      message: win32Messages.mouseWheel,
      wParam: wheelWParam(event),
      lParam: win32PointLParam(point),
      point,
    },
  });
}, { passive: false });
canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});
window.addEventListener("keydown", (event) => {
  const virtualKey = virtualKeyFromEvent(event);
  if (virtualKey < 0) {
    return;
  }
  event.preventDefault();
  const charCode = win32CharCodeFromEvent(event);
  void (async () => {
    await pushBrowserInputToWasm({
      virtualKey,
      keyDown: true,
      win32Message: {
        message: win32Messages.keyDown,
        wParam: virtualKey,
      },
    });
    if (charCode >= 0) {
      await pushBrowserInputToWasm({
        win32Message: {
          message: win32Messages.char,
          wParam: charCode,
        },
      });
    }
  })();
});
window.addEventListener("keyup", (event) => {
  const virtualKey = virtualKeyFromEvent(event);
  if (virtualKey < 0) {
    return;
  }
  event.preventDefault();
  void pushBrowserInputToWasm({
    virtualKey,
    keyDown: false,
    win32Message: {
      message: win32Messages.keyUp,
      wParam: virtualKey,
    },
  });
});
window.addEventListener("blur", () => {
  if (browserWin32Focused) {
    void setBrowserWin32Focus(false);
  } else {
    void resetBrowserInput();
  }
});

window.CnCPort = {
  rpc,
  state: harnessState,
};
