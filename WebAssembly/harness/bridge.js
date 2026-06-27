const canvas = document.querySelector("#viewport");
const gl = canvas.getContext("webgl2", {
  alpha: false,
  antialias: false,
  depth: true,
  stencil: false,
  preserveDrawingBuffer: true,
});
const s3tc = gl ? gl.getExtension("WEBGL_compressed_texture_s3tc") : null;
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
const D3DFMT_DXT1 = 0x31545844;
const D3DFMT_DXT3 = 0x33545844;
const D3DFMT_DXT5 = 0x35545844;
const GL_GREEN = 0x1904;
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
const D3DTSS_MIPMAPLODBIAS = 19;
const D3DTSS_MAXMIPLEVEL = 20;
const D3DTSS_TEXTURETRANSFORMFLAGS = 24;
const D3DTSS_ADDRESSW = 25;
const D3DTSS_COLORARG0 = 26;
const D3DTSS_ALPHAARG0 = 27;
const D3DTSS_RESULTARG = 28;
const D3DTOP_DISABLE = 1;
const D3DTOP_SELECTARG1 = 2;
const D3DTOP_SELECTARG2 = 3;
const D3DTOP_MODULATE = 4;
const D3DTOP_MODULATE2X = 5;
const D3DTOP_MODULATE4X = 6;
const D3DTOP_ADD = 7;
const D3DTOP_ADDSIGNED = 8;
const D3DTOP_ADDSIGNED2X = 9;
const D3DTOP_SUBTRACT = 10;
const D3DTOP_ADDSMOOTH = 11;
const D3DTOP_BLENDDIFFUSEALPHA = 12;
const D3DTOP_BLENDTEXTUREALPHA = 13;
const D3DTOP_BLENDFACTORALPHA = 14;
const D3DTOP_BLENDCURRENTALPHA = 16;
const D3DTOP_DOTPRODUCT3 = 24;
const D3DTOP_MULTIPLYADD = 25;
const D3DTOP_LERP = 26;
const D3DTA_SELECTMASK = 0x0000000f;
const D3DTA_DIFFUSE = 0;
const D3DTA_CURRENT = 1;
const D3DTA_TEXTURE = 2;
const D3DTA_TFACTOR = 3;
const D3DTA_TEMP = 5;
const D3DTA_COMPLEMENT = 0x00000010;
const D3DTA_ALPHAREPLICATE = 0x00000020;
const D3DTA_SUPPORTED_MODIFIERS = D3DTA_COMPLEMENT | D3DTA_ALPHAREPLICATE;
const D3DTSS_TCI_PASSTHRU = 0x00000000;
const D3DTSS_TCI_COORDINDEX_MASK = 0x0000ffff;
const D3DTSS_TCI_MODE_MASK = 0xffff0000;
const D3DTADDRESS_WRAP = 1;
const D3DTADDRESS_MIRROR = 2;
const D3DTADDRESS_CLAMP = 3;
const D3DTADDRESS_BORDER = 4;
const D3DTADDRESS_MIRRORONCE = 5;
const D3DTEXF_NONE = 0;
const D3DTEXF_POINT = 1;
const D3DTEXF_LINEAR = 2;
const D3DTEXF_ANISOTROPIC = 3;
const D3DTTFF_DISABLE = 0;
const D3DTTFF_COUNT1 = 1;
const D3DTTFF_COUNT2 = 2;
const D3DTTFF_COUNT3 = 3;
const D3DTTFF_COUNT4 = 4;
const D3DTTFF_PROJECTED = 256;
const D3D8_TEXTURE_STAGE_COUNT = 8;
const D3DFVF_XYZ = 0x002;
const D3DFVF_XYZRHW = 0x004;
const D3DFVF_XYZB4 = 0x008;
const D3DFVF_NORMAL = 0x010;
const D3DFVF_DIFFUSE = 0x040;
const D3DFVF_SPECULAR = 0x080;
const D3DFVF_TEXCOUNT_MASK = 0xf00;
const D3DFVF_TEXCOUNT_SHIFT = 8;
const D3D8_DIFFUSE_OFFSET = 24;
const D3D8_DIFFUSE_MIN_STRIDE = D3D8_DIFFUSE_OFFSET + 4;
// Matches WW3D2/dx8fvf.h VertexFormatXYZNDUV1/2: XYZ, normal, diffuse, UV0/UV1.
const D3D8_XYZNDUV_TEXCOORD0_OFFSET = 28;
const D3D8_XYZNDUV_TEXCOORD_STRIDE = 8;
const D3D8_XYZNDUV_TEXCOORD_SETS = 2;
const d3d8FloatBits = new ArrayBuffer(4);
const d3d8FloatView = new DataView(d3d8FloatBits);
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
  samplerApplications: 0,
  live: 0,
  legacyUploads: [],
  lastCreate: null,
  lastUpdate: null,
  lastSubrectUpdate: null,
  lastRelease: null,
  lastBind: null,
  lastReleaseUnbind: null,
  lastMissingBind: null,
  lastUnsupported: null,
  lastSampler: null,
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
  browserRuntimeAssets: null,
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
      // D3D8 fixed-function sampler contract for A8: RGB = 0, A = alpha.
      return {
        d3dFormat,
        supported: true,
        internalFormat: gl.R8,
        format: gl.RED,
        type: gl.UNSIGNED_BYTE,
        storage: "r8-alpha",
        swizzle: { r: gl.ZERO, g: gl.ZERO, b: gl.ZERO, a: gl.RED },
        semantic: "alpha",
      };
    case D3DFMT_L8:
      // D3D8 fixed-function sampler contract for L8: RGB = luminance, A = 1.
      return {
        d3dFormat,
        supported: true,
        internalFormat: gl.R8,
        format: gl.RED,
        type: gl.UNSIGNED_BYTE,
        storage: "r8-luminance",
        swizzle: { r: gl.RED, g: gl.RED, b: gl.RED, a: gl.ONE },
        semantic: "luminance",
      };
    case D3DFMT_A8L8:
      // D3D8 fixed-function sampler contract for A8L8: RGB = luminance, A = alpha.
      return {
        d3dFormat,
        supported: true,
        internalFormat: gl.RG8,
        format: gl.RG,
        type: gl.UNSIGNED_BYTE,
        storage: "rg8-luminance-alpha",
        swizzle: { r: gl.RED, g: gl.RED, b: gl.RED, a: GL_GREEN },
        semantic: "luminanceAlpha",
      };
    case D3DFMT_DXT1:
      return s3tc ? {
        d3dFormat,
        supported: true,
        compressed: true,
        internalFormat: s3tc.COMPRESSED_RGB_S3TC_DXT1_EXT,
        format: 0,
        type: 0,
        storage: "dxt1",
        blockBytes: 8,
      } : {
        d3dFormat,
        supported: false,
        reason: "WEBGL_compressed_texture_s3tc is unavailable for DXT1 upload",
      };
    case D3DFMT_DXT3:
      return s3tc ? {
        d3dFormat,
        supported: true,
        compressed: true,
        internalFormat: s3tc.COMPRESSED_RGBA_S3TC_DXT3_EXT,
        format: 0,
        type: 0,
        storage: "dxt3",
        blockBytes: 16,
      } : {
        d3dFormat,
        supported: false,
        reason: "WEBGL_compressed_texture_s3tc is unavailable for DXT3 upload",
      };
    case D3DFMT_DXT5:
      return s3tc ? {
        d3dFormat,
        supported: true,
        compressed: true,
        internalFormat: s3tc.COMPRESSED_RGBA_S3TC_DXT5_EXT,
        format: 0,
        type: 0,
        storage: "dxt5",
        blockBytes: 16,
      } : {
        d3dFormat,
        supported: false,
        reason: "WEBGL_compressed_texture_s3tc is unavailable for DXT5 upload",
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

function applyD3D8TextureSwizzleIfChanged(resource, info) {
  if (!resource || !info?.swizzle) {
    return null;
  }
  if (resource.swizzleStorage === info.storage) {
    return resource.swizzleApplied || null;
  }
  // Keep the raw R/RG texture storage stable; the draw shader reconstructs
  // D3D8 legacy sampler semantics before the fixed-function combiner runs.
  resource.swizzleStorage = info.storage;
  resource.swizzleSemantic = info.semantic;
  resource.swizzleApplied = {
    r: info.swizzle.r,
    g: info.swizzle.g,
    b: info.swizzle.b,
    a: info.swizzle.a,
    semantic: info.semantic,
    storage: info.storage,
    appliedBy: "shader",
  };
  return resource.swizzleApplied;
}

function decodeLegacyD3D8PixelFromRgba(rgba, semantic) {
  if (!Array.isArray(rgba) || rgba.length < 4) {
    return null;
  }
  switch (semantic) {
    case "alpha":
    case "luminance":
      return [rgba[0]];
    case "luminanceAlpha":
      return [rgba[0], rgba[1]];
    default:
      return null;
  }
}

function d3dTextureAddressToGl(address) {
  switch (Number(address) >>> 0) {
    case D3DTADDRESS_WRAP:
      return { value: gl.REPEAT, supported: true, name: "repeat" };
    case D3DTADDRESS_MIRROR:
      return { value: gl.MIRRORED_REPEAT, supported: true, name: "mirroredRepeat" };
    case D3DTADDRESS_CLAMP:
      return { value: gl.CLAMP_TO_EDGE, supported: true, name: "clampToEdge" };
    case D3DTADDRESS_BORDER:
      return { value: gl.CLAMP_TO_EDGE, supported: false, name: "borderFallbackClamp" };
    case D3DTADDRESS_MIRRORONCE:
      return { value: gl.MIRRORED_REPEAT, supported: false, name: "mirrorOnceFallbackMirror" };
    default:
      return { value: gl.CLAMP_TO_EDGE, supported: false, name: "unknownFallbackClamp" };
  }
}

function d3dTextureMagFilterToGl(filter) {
  switch (Number(filter) >>> 0) {
    case D3DTEXF_POINT:
      return { value: gl.NEAREST, supported: true, name: "nearest" };
    case D3DTEXF_LINEAR:
    case D3DTEXF_ANISOTROPIC:
      return { value: gl.LINEAR, supported: true, name: "linear" };
    default:
      return { value: gl.NEAREST, supported: false, name: "unknownFallbackNearest" };
  }
}

function d3dTextureMinFilterToGl(minFilter, mipFilter, hasCompleteMipChain) {
  const min = Number(minFilter) >>> 0;
  const mip = Number(mipFilter) >>> 0;
  const linearMin = min === D3DTEXF_LINEAR || min === D3DTEXF_ANISOTROPIC;
  const base = linearMin ? gl.LINEAR : gl.NEAREST;
  const supportedMin = min === D3DTEXF_POINT || min === D3DTEXF_LINEAR || min === D3DTEXF_ANISOTROPIC;
  if (mip === D3DTEXF_NONE || !hasCompleteMipChain) {
    return {
      value: base,
      supported: supportedMin && (mip === D3DTEXF_NONE || mip === D3DTEXF_POINT || mip === D3DTEXF_LINEAR),
      name: base === gl.LINEAR ? "linear" : "nearest",
      usedMipmaps: false,
      requestedMipmaps: mip !== D3DTEXF_NONE,
      fallbackReason: mip !== D3DTEXF_NONE && !hasCompleteMipChain ? "incomplete mip chain" : null,
    };
  }
  if (mip === D3DTEXF_POINT) {
    return {
      value: linearMin ? gl.LINEAR_MIPMAP_NEAREST : gl.NEAREST_MIPMAP_NEAREST,
      supported: supportedMin,
      name: linearMin ? "linearMipmapNearest" : "nearestMipmapNearest",
      usedMipmaps: true,
      requestedMipmaps: true,
      fallbackReason: null,
    };
  }
  if (mip === D3DTEXF_LINEAR) {
    return {
      value: linearMin ? gl.LINEAR_MIPMAP_LINEAR : gl.NEAREST_MIPMAP_LINEAR,
      supported: supportedMin,
      name: linearMin ? "linearMipmapLinear" : "nearestMipmapLinear",
      usedMipmaps: true,
      requestedMipmaps: true,
      fallbackReason: null,
    };
  }
  return {
    value: base,
    supported: false,
    name: base === gl.LINEAR ? "unknownMipFallbackLinear" : "unknownMipFallbackNearest",
    usedMipmaps: false,
    requestedMipmaps: true,
    fallbackReason: "unsupported mip filter",
  };
}

function d3dDwordToFloat(value) {
  d3d8FloatView.setUint32(0, Number(value) >>> 0, true);
  const decoded = d3d8FloatView.getFloat32(0, true);
  return Number.isFinite(decoded) ? decoded : 0.0;
}

function d3dColorToNormalizedRgba(value) {
  const color = Number(value) >>> 0;
  return [
    ((color >>> 16) & 0xff) / 255,
    ((color >>> 8) & 0xff) / 255,
    (color & 0xff) / 255,
    ((color >>> 24) & 0xff) / 255,
  ];
}

function textureHasCompleteMipChain(resource) {
  if (!resource || resource.levels <= 1) {
    return false;
  }
  for (let level = 0; level < resource.levels; ++level) {
    if (!resource.initializedLevels.has(String(level))) {
      return false;
    }
  }
  return true;
}

function applyD3D8TextureSamplerToBoundTexture(stage, textureStage, resource) {
  if (!gl || !resource?.texture || !textureStage) {
    return null;
  }
  const completeMipChain = textureHasCompleteMipChain(resource);
  const min = d3dTextureMinFilterToGl(textureStage.minFilter, textureStage.mipFilter, completeMipChain);
  const mag = d3dTextureMagFilterToGl(textureStage.magFilter);
  const wrapS = d3dTextureAddressToGl(textureStage.addressU);
  const wrapT = d3dTextureAddressToGl(textureStage.addressV);
  const levelCount = Math.max(1, Number(resource.levels ?? 1) >>> 0);
  const highestLevel = levelCount - 1;
  const requestedMaxMipLevel = Number(textureStage.maxMipLevel ?? 0) >>> 0;
  const baseLevel = completeMipChain ? Math.min(requestedMaxMipLevel, highestLevel) : 0;
  const maxLevel = completeMipChain ? Math.max(baseLevel, highestLevel) : 0;
  const lodBiasBits = Number(textureStage.mipMapLodBias ?? 0) >>> 0;
  const lodBias = d3dDwordToFloat(lodBiasBits);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, min.value);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, mag.value);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS.value);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapT.value);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, baseLevel);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, maxLevel);

  const applied = {
    stage,
    textureId: resource.id,
    d3d: {
      minFilter: Number(textureStage.minFilter) >>> 0,
      magFilter: Number(textureStage.magFilter) >>> 0,
      mipFilter: Number(textureStage.mipFilter) >>> 0,
      addressU: Number(textureStage.addressU) >>> 0,
      addressV: Number(textureStage.addressV) >>> 0,
      maxMipLevel: requestedMaxMipLevel,
      mipMapLodBiasBits: lodBiasBits,
      mipMapLodBias: lodBias,
    },
    gl: {
      minFilter: min.value,
      magFilter: mag.value,
      wrapS: wrapS.value,
      wrapT: wrapT.value,
      baseLevel,
      maxLevel,
      lodBias,
      lodBiasSource: "shader",
    },
    names: {
      minFilter: min.name,
      magFilter: mag.name,
      wrapS: wrapS.name,
      wrapT: wrapT.name,
    },
    completeMipChain,
    maxMipLevelClamped: requestedMaxMipLevel !== baseLevel,
    usedMipmaps: min.usedMipmaps,
    requestedMipmaps: min.requestedMipmaps,
    fallbackReason: min.fallbackReason,
    supported: min.supported && mag.supported && wrapS.supported && wrapT.supported,
  };
  resource.samplerState = applied;
  d3d8TextureStats.samplerApplications += 1;
  d3d8TextureStats.lastSampler = applied;
  updateD3D8TextureSummary();
  return applied;
}

function d3dTextureCombinerOpName(op) {
  switch (Number(op) >>> 0) {
    case D3DTOP_DISABLE:
      return "disable";
    case D3DTOP_SELECTARG1:
      return "selectArg1";
    case D3DTOP_SELECTARG2:
      return "selectArg2";
    case D3DTOP_MODULATE:
      return "modulate";
    case D3DTOP_MODULATE2X:
      return "modulate2X";
    case D3DTOP_MODULATE4X:
      return "modulate4X";
    case D3DTOP_ADD:
      return "add";
    case D3DTOP_ADDSIGNED:
      return "addSigned";
    case D3DTOP_ADDSIGNED2X:
      return "addSigned2X";
    case D3DTOP_SUBTRACT:
      return "subtract";
    case D3DTOP_ADDSMOOTH:
      return "addSmooth";
    case D3DTOP_BLENDDIFFUSEALPHA:
      return "blendDiffuseAlpha";
    case D3DTOP_BLENDTEXTUREALPHA:
      return "blendTextureAlpha";
    case D3DTOP_BLENDFACTORALPHA:
      return "blendFactorAlpha";
    case D3DTOP_BLENDCURRENTALPHA:
      return "blendCurrentAlpha";
    case D3DTOP_DOTPRODUCT3:
      return "dotProduct3";
    case D3DTOP_MULTIPLYADD:
      return "multiplyAdd";
    case D3DTOP_LERP:
      return "lerp";
    default:
      return "unsupported";
  }
}

function d3dTextureCombinerOpSupported(op) {
  switch (Number(op) >>> 0) {
    case D3DTOP_DISABLE:
    case D3DTOP_SELECTARG1:
    case D3DTOP_SELECTARG2:
    case D3DTOP_MODULATE:
    case D3DTOP_MODULATE2X:
    case D3DTOP_MODULATE4X:
    case D3DTOP_ADD:
    case D3DTOP_ADDSIGNED:
    case D3DTOP_ADDSIGNED2X:
    case D3DTOP_SUBTRACT:
    case D3DTOP_ADDSMOOTH:
    case D3DTOP_BLENDDIFFUSEALPHA:
    case D3DTOP_BLENDTEXTUREALPHA:
    case D3DTOP_BLENDFACTORALPHA:
    case D3DTOP_BLENDCURRENTALPHA:
    case D3DTOP_DOTPRODUCT3:
    case D3DTOP_MULTIPLYADD:
    case D3DTOP_LERP:
      return true;
    default:
      return false;
  }
}

function d3dTextureCombinerOpUsesArg0(op) {
  const normalized = Number(op) >>> 0;
  return normalized === D3DTOP_MULTIPLYADD || normalized === D3DTOP_LERP;
}

function d3dTextureCombinerOpUsesArg1(op) {
  switch (Number(op) >>> 0) {
    case D3DTOP_SELECTARG1:
    case D3DTOP_MODULATE:
    case D3DTOP_MODULATE2X:
    case D3DTOP_MODULATE4X:
    case D3DTOP_ADD:
    case D3DTOP_ADDSIGNED:
    case D3DTOP_ADDSIGNED2X:
    case D3DTOP_SUBTRACT:
    case D3DTOP_ADDSMOOTH:
    case D3DTOP_BLENDDIFFUSEALPHA:
    case D3DTOP_BLENDTEXTUREALPHA:
    case D3DTOP_BLENDFACTORALPHA:
    case D3DTOP_BLENDCURRENTALPHA:
    case D3DTOP_DOTPRODUCT3:
    case D3DTOP_MULTIPLYADD:
    case D3DTOP_LERP:
      return true;
    default:
      return false;
  }
}

function d3dTextureCombinerOpUsesArg2(op) {
  switch (Number(op) >>> 0) {
    case D3DTOP_SELECTARG2:
    case D3DTOP_MODULATE:
    case D3DTOP_MODULATE2X:
    case D3DTOP_MODULATE4X:
    case D3DTOP_ADD:
    case D3DTOP_ADDSIGNED:
    case D3DTOP_ADDSIGNED2X:
    case D3DTOP_SUBTRACT:
    case D3DTOP_ADDSMOOTH:
    case D3DTOP_BLENDDIFFUSEALPHA:
    case D3DTOP_BLENDTEXTUREALPHA:
    case D3DTOP_BLENDFACTORALPHA:
    case D3DTOP_BLENDCURRENTALPHA:
    case D3DTOP_DOTPRODUCT3:
    case D3DTOP_MULTIPLYADD:
    case D3DTOP_LERP:
      return true;
    default:
      return false;
  }
}

function d3dTextureCombinerArgBaseName(arg) {
  switch ((Number(arg) >>> 0) & D3DTA_SELECTMASK) {
    case D3DTA_DIFFUSE:
      return "diffuse";
    case D3DTA_CURRENT:
      return "current";
    case D3DTA_TEXTURE:
      return "texture";
    case D3DTA_TFACTOR:
      return "textureFactor";
    case D3DTA_TEMP:
      return "temp";
    default:
      return "unsupported";
  }
}

function d3dTextureCombinerArgSupported(arg) {
  const normalized = Number(arg) >>> 0;
  const baseName = d3dTextureCombinerArgBaseName(normalized);
  const modifiers = normalized & ~D3DTA_SELECTMASK;
  return baseName !== "unsupported" && (modifiers & ~D3DTA_SUPPORTED_MODIFIERS) === 0;
}

function d3dTextureCombinerResultArgSupported(arg) {
  const normalized = Number(arg) >>> 0;
  return normalized === D3DTA_CURRENT || normalized === D3DTA_TEMP;
}

function d3dTextureCombinerArgName(arg) {
  const normalized = Number(arg) >>> 0;
  if (!d3dTextureCombinerArgSupported(normalized)) {
    return "unsupported";
  }
  let name = d3dTextureCombinerArgBaseName(normalized);
  if (normalized & D3DTA_ALPHAREPLICATE) {
    name += "AlphaReplicate";
  }
  if (normalized & D3DTA_COMPLEMENT) {
    name += "Complement";
  }
  return name;
}

function d3dTextureCoordinateModeName(mode) {
  switch (Number(mode) >>> 0) {
    case D3DTSS_TCI_PASSTHRU:
      return "passthru";
    case 0x00010000:
      return "cameraSpaceNormal";
    case 0x00020000:
      return "cameraSpacePosition";
    case 0x00030000:
      return "cameraSpaceReflectionVector";
    default:
      return "unsupported";
  }
}

function d3dTextureTransformFlagsName(flags) {
  const normalizedFlags = Number(flags) >>> 0;
  if (normalizedFlags === D3DTTFF_DISABLE) {
    return "disable";
  }
  const projected = (normalizedFlags & D3DTTFF_PROJECTED) !== 0;
  const count = normalizedFlags & ~D3DTTFF_PROJECTED;
  const suffix = projected ? "Projected" : "";
  switch (count) {
    case D3DTTFF_COUNT1:
      return `count1${suffix}`;
    case D3DTTFF_COUNT2:
      return `count2${suffix}`;
    case D3DTTFF_COUNT3:
      return `count3${suffix}`;
    case D3DTTFF_COUNT4:
      return `count4${suffix}`;
    default:
      return "unsupported";
  }
}

function d3d8TexCoordComponentCount(fvf, coordSet) {
  const encoded = (Number(fvf) >>> (16 + coordSet * 2)) & 0x3;
  switch (encoded) {
    case 1:
      return 3;
    case 2:
      return 4;
    case 3:
      return 1;
    case 0:
    default:
      return 2;
  }
}

function d3d8LegacyVertexLayoutInfo(vertexStride) {
  const stride = Number(vertexStride) >>> 0;
  return {
    source: "legacy-xyzn-duv",
    fvf: 0,
    stride,
    positionOffset: 0,
    positionComponents: 3,
    diffuseOffset: stride >= D3D8_DIFFUSE_MIN_STRIDE ? D3D8_DIFFUSE_OFFSET : null,
    specularOffset: null,
    texCoords: Array.from({ length: D3D8_XYZNDUV_TEXCOORD_SETS }, (_, coordSet) => {
      const offset = D3D8_XYZNDUV_TEXCOORD0_OFFSET +
        (coordSet * D3D8_XYZNDUV_TEXCOORD_STRIDE);
      return {
        coordSet,
        offset,
        components: 2,
        available: stride >= offset + D3D8_XYZNDUV_TEXCOORD_STRIDE,
      };
    }),
  };
}

function d3d8VertexLayoutInfo(fvf, vertexStride) {
  const normalizedFvf = Number(fvf ?? 0) >>> 0;
  const stride = Number(vertexStride) >>> 0;
  if (normalizedFvf === 0) {
    return d3d8LegacyVertexLayoutInfo(stride);
  }

  let offset = 0;
  let positionComponents = 0;
  if ((normalizedFvf & D3DFVF_XYZRHW) === D3DFVF_XYZRHW) {
    positionComponents = 4;
    offset += 4 * 4;
  } else if ((normalizedFvf & D3DFVF_XYZB4) === D3DFVF_XYZB4) {
    positionComponents = 7;
    offset += 7 * 4;
  } else if ((normalizedFvf & D3DFVF_XYZ) === D3DFVF_XYZ) {
    positionComponents = 3;
    offset += 3 * 4;
  }

  if ((normalizedFvf & D3DFVF_NORMAL) === D3DFVF_NORMAL) {
    offset += 3 * 4;
  }

  const diffuseOffset = (normalizedFvf & D3DFVF_DIFFUSE) === D3DFVF_DIFFUSE
    ? offset
    : null;
  if (diffuseOffset !== null) {
    offset += 4;
  }

  const specularOffset = (normalizedFvf & D3DFVF_SPECULAR) === D3DFVF_SPECULAR
    ? offset
    : null;
  if (specularOffset !== null) {
    offset += 4;
  }

  const texCoordCount = (normalizedFvf & D3DFVF_TEXCOUNT_MASK) >>> D3DFVF_TEXCOUNT_SHIFT;
  const texCoords = [];
  for (let coordSet = 0; coordSet < texCoordCount; ++coordSet) {
    const components = d3d8TexCoordComponentCount(normalizedFvf, coordSet);
    texCoords.push({
      coordSet,
      offset,
      components,
      available: components >= 2 && stride >= offset + 2 * 4,
    });
    offset += components * 4;
  }

  return {
    source: "fvf",
    fvf: normalizedFvf,
    stride,
    positionOffset: 0,
    positionComponents,
    diffuseOffset: diffuseOffset !== null && stride >= diffuseOffset + 4 ? diffuseOffset : null,
    specularOffset: specularOffset !== null && stride >= specularOffset + 4 ? specularOffset : null,
    texCoords,
    computedStride: offset,
  };
}

function textureStageCoordinateInfo(textureStage, stage, vertexStride, vertexLayout, textureTransform = null) {
  const texCoordIndex = Number(textureStage?.texCoordIndex ?? 0) >>> 0;
  const mode = texCoordIndex & D3DTSS_TCI_MODE_MASK;
  const coordSet = texCoordIndex & D3DTSS_TCI_COORDINDEX_MASK;
  const textureTransformFlags = Number(textureStage?.textureTransformFlags ?? D3DTTFF_DISABLE) >>> 0;
  const layout = vertexLayout ?? d3d8LegacyVertexLayoutInfo(vertexStride);
  const texCoord = Array.isArray(layout.texCoords) ? layout.texCoords[coordSet] : null;
  const texCoordOffset = Number(texCoord?.offset ?? 0) >>> 0;
  const passthru = mode === D3DTSS_TCI_PASSTHRU;
  const coordSetAvailable = Boolean(texCoord?.available);
  const transformApplied = textureTransformFlags === D3DTTFF_COUNT2 && textureTransform !== null;
  const transformSupported = textureTransformFlags === D3DTTFF_DISABLE || transformApplied;
  return {
    stage,
    texCoordIndex,
    mode,
    modeName: d3dTextureCoordinateModeName(mode),
    coordSet,
    layoutSource: layout.source,
    offset: coordSetAvailable ? texCoordOffset : null,
    components: coordSetAvailable ? texCoord.components : 0,
    textureTransformFlags,
    textureTransformModeName: d3dTextureTransformFlagsName(textureTransformFlags),
    transformSupported,
    transformApplied,
    supported: passthru && coordSetAvailable && transformSupported,
  };
}

function textureStageCombinerInfo(textureStage, stage, canSampleTexture) {
  if (!textureStage) {
    return null;
  }
  const colorOp = Number(textureStage.colorOp) >>> 0;
  const colorArg0 = Number(textureStage.colorArg0) >>> 0;
  const colorArg1 = Number(textureStage.colorArg1) >>> 0;
  const colorArg2 = Number(textureStage.colorArg2) >>> 0;
  const resultArg = Number(textureStage.resultArg) >>> 0;
  const colorArg0Base = colorArg0 & D3DTA_SELECTMASK;
  const colorArg1Base = colorArg1 & D3DTA_SELECTMASK;
  const colorArg2Base = colorArg2 & D3DTA_SELECTMASK;
  const colorNeedsArg0 = d3dTextureCombinerOpUsesArg0(colorOp);
  const colorNeedsArg1 = d3dTextureCombinerOpUsesArg1(colorOp);
  const colorNeedsArg2 = d3dTextureCombinerOpUsesArg2(colorOp);
  const supportedOp = d3dTextureCombinerOpSupported(colorOp);
  const supportedArg0 = !colorNeedsArg0 || d3dTextureCombinerArgSupported(colorArg0);
  const supportedArg1 = !colorNeedsArg1 || d3dTextureCombinerArgSupported(colorArg1);
  const supportedArg2 = !colorNeedsArg2 || d3dTextureCombinerArgSupported(colorArg2);
  const supportedResultArg = d3dTextureCombinerResultArgSupported(resultArg);
  const needsTexture = (colorNeedsArg0 && colorArg0Base === D3DTA_TEXTURE)
    || (colorNeedsArg1 && colorArg1Base === D3DTA_TEXTURE)
    || (colorNeedsArg2 && colorArg2Base === D3DTA_TEXTURE);
  const alphaOp = Number(textureStage.alphaOp) >>> 0;
  const alphaArg0 = Number(textureStage.alphaArg0) >>> 0;
  const alphaArg1 = Number(textureStage.alphaArg1) >>> 0;
  const alphaArg2 = Number(textureStage.alphaArg2) >>> 0;
  const alphaArg0Base = alphaArg0 & D3DTA_SELECTMASK;
  const alphaArg1Base = alphaArg1 & D3DTA_SELECTMASK;
  const alphaArg2Base = alphaArg2 & D3DTA_SELECTMASK;
  const stageAlphaPassesCurrent = alphaOp === D3DTOP_SELECTARG2 && alphaArg2Base === D3DTA_CURRENT;
  const alphaNeedsArg0 = d3dTextureCombinerOpUsesArg0(alphaOp);
  const alphaNeedsArg1 = d3dTextureCombinerOpUsesArg1(alphaOp);
  const alphaNeedsArg2 = d3dTextureCombinerOpUsesArg2(alphaOp);
  const supportedAlphaOp = stage === 0
    ? d3dTextureCombinerOpSupported(alphaOp)
    : alphaOp === D3DTOP_DISABLE || stageAlphaPassesCurrent;
  const supportedAlphaArg0 = !alphaNeedsArg0 || d3dTextureCombinerArgSupported(alphaArg0);
  const supportedAlphaArg1 = !alphaNeedsArg1 || d3dTextureCombinerArgSupported(alphaArg1);
  const supportedAlphaArg2 = !alphaNeedsArg2 || d3dTextureCombinerArgSupported(alphaArg2);
  const needsTextureAlpha = (alphaNeedsArg0 && alphaArg0Base === D3DTA_TEXTURE)
    || (alphaNeedsArg1 && alphaArg1Base === D3DTA_TEXTURE)
    || (alphaNeedsArg2 && alphaArg2Base === D3DTA_TEXTURE);
  return {
    stage,
    colorOp,
    colorArg0,
    colorArg1,
    colorArg2,
    resultArg,
    alphaOp,
    alphaArg0,
    alphaArg1,
    alphaArg2,
    opName: d3dTextureCombinerOpName(colorOp),
    arg0Name: d3dTextureCombinerArgName(colorArg0),
    arg1Name: d3dTextureCombinerArgName(colorArg1),
    arg2Name: d3dTextureCombinerArgName(colorArg2),
    resultArgName: d3dTextureCombinerArgName(resultArg),
    alphaOpName: d3dTextureCombinerOpName(alphaOp),
    alphaArg0Name: d3dTextureCombinerArgName(alphaArg0),
    alphaArg1Name: d3dTextureCombinerArgName(alphaArg1),
    alphaArg2Name: d3dTextureCombinerArgName(alphaArg2),
    supportsColorOp: supportedOp,
    supportsColorArgs: supportedArg0 && supportedArg1 && supportedArg2,
    supportsResultArg: supportedResultArg,
    supportsAlphaOp: supportedAlphaOp,
    supportsAlphaArgs: supportedAlphaArg0 && supportedAlphaArg1 && supportedAlphaArg2,
    textureAvailable: Boolean(canSampleTexture),
    supported: supportedOp && supportedArg0 && supportedArg1 && supportedArg2 && supportedResultArg
      && supportedAlphaOp && supportedAlphaArg0 && supportedAlphaArg1 && supportedAlphaArg2
      && (!needsTexture || canSampleTexture)
      && (!needsTextureAlpha || canSampleTexture),
  };
}

function d3d8TextureSemanticMode(resource) {
  switch (resource?.semantic) {
    case "alpha":
      return 1;
    case "luminance":
      return 2;
    case "luminanceAlpha":
      return 3;
    default:
      return 0;
  }
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
      samplerApplications: d3d8TextureStats.samplerApplications,
      live: d3d8TextureStats.live,
      legacyUploads: d3d8TextureStats.legacyUploads,
      boundTextures,
      lastCreate: d3d8TextureStats.lastCreate,
      lastUpdate: d3d8TextureStats.lastUpdate,
      lastSubrectUpdate: d3d8TextureStats.lastSubrectUpdate,
      lastRelease: d3d8TextureStats.lastRelease,
      lastBind: d3d8TextureStats.lastBind,
      lastReleaseUnbind: d3d8TextureStats.lastReleaseUnbind,
      lastMissingBind: d3d8TextureStats.lastMissingBind,
      lastUnsupported: d3d8TextureStats.lastUnsupported,
      lastSampler: d3d8TextureStats.lastSampler,
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
    samplerState: null,
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

  if (info.compressed && (x !== 0 || y !== 0 || width !== levelSize.width || height !== levelSize.height)) {
    d3d8TextureStats.unsupportedUpdates += 1;
    d3d8TextureStats.lastUnsupported = {
      id,
      level,
      format,
      reason: "compressed DXT sub-rectangle updates are not implemented",
    };
    updateD3D8TextureSummary();
    return 0;
  }

  const convertedBytes = info.compressed
    ? payload.bytes
    : convertD3D8TextureBytes(format, payload.bytes, width, height);
  const uploadBytes = info.compressed ? convertedBytes : d3d8TextureUploadView(info, convertedBytes);
  resource.storage = info.storage;
  resource.semantic = info.semantic || null;
  const levelKey = String(level);
  const levelInitialized = resource.initializedLevels.has(levelKey);
  const levelFormat = resource.levelFormats.get(levelKey);
  let swizzleApplied = resource.swizzleApplied || null;
  withPreservedD3D8TextureUnit(() => {
    gl.bindTexture(gl.TEXTURE_2D, resource.texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (!levelInitialized || levelFormat !== info.storage) {
      if (info.compressed) {
        gl.compressedTexImage2D(gl.TEXTURE_2D, level, info.internalFormat, width, height, 0, uploadBytes);
      } else if (x === 0 && y === 0 && width === levelSize.width && height === levelSize.height) {
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
      if (info.compressed) {
        gl.compressedTexImage2D(gl.TEXTURE_2D, level, info.internalFormat, width, height, 0, uploadBytes);
      } else {
        gl.texSubImage2D(gl.TEXTURE_2D, level, x, y, width, height, info.format, info.type, uploadBytes);
      }
    }
    swizzleApplied = applyD3D8TextureSwizzleIfChanged(resource, info);
  });

  resource.uploads += 1;
  d3d8TextureStats.updates += 1;
  let samplePixel = null;
  let legacySamplePixel = null;
  if (level === 0 && !info.compressed) {
    samplePixel = sampleD3D8TexturePixel(resource, x, y);
    if (samplePixel && info.semantic) {
      legacySamplePixel = decodeLegacyD3D8PixelFromRgba(samplePixel, info.semantic);
    }
  }
  d3d8TextureStats.lastUpdate = {
    id,
    level,
    x,
    y,
    width,
    height,
    format,
    storage: info.storage,
    compressed: Boolean(info.compressed),
    blockBytes: Number(info.blockBytes ?? 0) >>> 0,
    semantic: info.semantic || null,
    swizzle: swizzleApplied,
    pitch: Number(payload.pitch ?? 0) >>> 0,
    rowBytes: Number(payload.rowBytes ?? 0) >>> 0,
    byteSize: payload.bytes.byteLength,
    convertedByteSize: convertedBytes.byteLength,
    usage: Number(payload.usage ?? 0) >>> 0,
    lockFlags: Number(payload.lockFlags ?? 0) >>> 0,
    uploads: resource.uploads,
    samplePixel,
    legacySamplePixel: level === 0 && info.semantic ? legacySamplePixel : null,
  };
  if (level === 0 && info.semantic) {
    d3d8TextureStats.legacyUploads.push({
      id,
      format,
      storage: info.storage,
      semantic: info.semantic,
      swizzle: swizzleApplied,
      width,
      height,
      samplePixel,
      legacySamplePixel,
    });
    if (d3d8TextureStats.legacyUploads.length > 64) {
      d3d8TextureStats.legacyUploads.shift();
    }
  }
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

function sampleCanvasRegion(rect = {}, threshold = 8) {
  syncCanvasSize();
  const canvasWidth = gl ? gl.drawingBufferWidth : canvas.width;
  const canvasHeight = gl ? gl.drawingBufferHeight : canvas.height;
  const left = Math.max(0, Math.min(canvasWidth, Math.floor(Number(rect.left ?? rect.x ?? 0))));
  const top = Math.max(0, Math.min(canvasHeight, Math.floor(Number(rect.top ?? rect.y ?? 0))));
  const right = Math.max(left, Math.min(canvasWidth, Math.ceil(Number(rect.right ?? (left + (rect.width ?? 0))))));
  const bottom = Math.max(top, Math.min(canvasHeight, Math.ceil(Number(rect.bottom ?? (top + (rect.height ?? 0))))));
  const width = right - left;
  const height = bottom - top;
  const result = {
    left,
    top,
    right,
    bottom,
    width,
    height,
    pixelCount: width * height,
    coloredPixelCount: 0,
    maxComponent: 0,
    brightestPixel: [0, 0, 0, 0],
  };
  if (width <= 0 || height <= 0) {
    return result;
  }

  let data = null;
  if (gl) {
    data = new Uint8Array(width * height * 4);
    const readY = Math.max(0, gl.drawingBufferHeight - bottom);
    gl.readPixels(left, readY, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data);
  } else if (fallbackContext) {
    data = fallbackContext.getImageData(left, top, width, height).data;
  } else {
    return result;
  }

  for (let offset = 0; offset < data.length; offset += 4) {
    const pixel = [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]];
    const maxComponent = Math.max(pixel[0], pixel[1], pixel[2]);
    if (maxComponent > result.maxComponent) {
      result.maxComponent = maxComponent;
      result.brightestPixel = pixel;
    }
    if (maxComponent > threshold && pixel[3] > 0) {
      result.coloredPixelCount += 1;
    }
  }
  result.coverageRatio = result.pixelCount > 0
    ? result.coloredPixelCount / result.pixelCount
    : 0;
  return result;
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
    in vec2 aTexCoord1;
    uniform float uScale;
    uniform bool uUseTransforms;
    uniform mat4 uWorld;
    uniform mat4 uView;
    uniform mat4 uProjection;
    uniform bool uUseTexture0Transform;
    uniform mat4 uTexture0Transform;
    uniform bool uUseTexture1Transform;
    uniform mat4 uTexture1Transform;
    out vec4 vColor;
    out vec2 vTexCoord0;
    out vec2 vTexCoord1;
    void main() {
      if (uUseTransforms) {
        vec4 d3dClip = uProjection * uView * uWorld * vec4(aPosition, 1.0);
        gl_Position = vec4(d3dClip.x, d3dClip.y, d3dClip.z * 2.0 - d3dClip.w, d3dClip.w);
      } else {
        gl_Position = vec4(aPosition.x / uScale, aPosition.y / uScale, 0.0, 1.0);
      }
      vColor = vec4(aDiffuseBgra.b, aDiffuseBgra.g, aDiffuseBgra.r, aDiffuseBgra.a);
      if (uUseTexture0Transform) {
        vec4 d3dTexCoord0 = uTexture0Transform * vec4(aTexCoord0, 0.0, 1.0);
        vTexCoord0 = d3dTexCoord0.xy;
      } else {
        vTexCoord0 = aTexCoord0;
      }
      if (uUseTexture1Transform) {
        vec4 d3dTexCoord1 = uTexture1Transform * vec4(aTexCoord1, 0.0, 1.0);
        vTexCoord1 = d3dTexCoord1.xy;
      } else {
        vTexCoord1 = aTexCoord1;
      }
    }
  `);
  const fragmentShader = compileShader(gl.FRAGMENT_SHADER, `#version 300 es
    precision mediump float;
    in vec4 vColor;
    in vec2 vTexCoord0;
    in vec2 vTexCoord1;
    uniform bool uUseTexture0;
    uniform sampler2D uTexture0;
    uniform float uTexture0LodBias;
    uniform int uTexture0Semantic;
    uniform bool uUseTexture1;
    uniform sampler2D uTexture1;
    uniform float uTexture1LodBias;
    uniform int uTexture1Semantic;
    uniform vec4 uTextureFactor;
    uniform int uStage0ColorOp;
    uniform int uStage0ColorArg0;
    uniform int uStage0ColorArg1;
    uniform int uStage0ColorArg2;
    uniform int uStage0AlphaOp;
    uniform int uStage0AlphaArg0;
    uniform int uStage0AlphaArg1;
    uniform int uStage0AlphaArg2;
    uniform int uStage0ResultArg;
    uniform int uStage1ColorOp;
    uniform int uStage1ColorArg0;
    uniform int uStage1ColorArg1;
    uniform int uStage1ColorArg2;
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
    vec4 d3dTextureSample(vec4 rawSample, int semantic) {
      if (semantic == 1) {
        return vec4(0.0, 0.0, 0.0, rawSample.r);
      }
      if (semantic == 2) {
        return vec4(rawSample.r, rawSample.r, rawSample.r, 1.0);
      }
      if (semantic == 3) {
        return vec4(rawSample.r, rawSample.r, rawSample.r, rawSample.g);
      }
      return rawSample;
    }
    // D3DTA_DIFFUSE == 0, D3DTA_CURRENT == 1, D3DTA_TEXTURE == 2,
    // D3DTA_TFACTOR == 3, D3DTA_TEMP == 5.
    // D3DTA_COMPLEMENT == 0x10, D3DTA_ALPHAREPLICATE == 0x20.
    vec4 d3dCombinerSource(int arg, vec4 textureColor, vec4 currentColor, vec4 diffuseColor, vec4 tempColor) {
      int source = arg & 15;
      if (source == 0) {
        return diffuseColor;
      }
      if (source == 1) {
        return currentColor;
      }
      if (source == 2) {
        return textureColor;
      }
      if (source == 3) {
        return uTextureFactor;
      }
      if (source == 5) {
        return tempColor;
      }
      return currentColor;
    }
    vec3 d3dCombinerColorArg(int arg, vec4 textureColor, vec4 currentColor, vec4 diffuseColor, vec4 tempColor) {
      vec4 source = d3dCombinerSource(arg, textureColor, currentColor, diffuseColor, tempColor);
      vec3 value = (arg & 32) != 0 ? vec3(source.a) : source.rgb;
      if ((arg & 16) != 0) {
        value = vec3(1.0) - value;
      }
      return value;
    }
    vec3 d3dDotProduct3(vec3 arg1, vec3 arg2) {
      return vec3(clamp(dot(arg1 * 2.0 - 1.0, arg2 * 2.0 - 1.0), 0.0, 1.0));
    }
    float d3dCombinerBlendFactor(int op, vec4 textureColor, vec4 currentColor, vec4 diffuseColor) {
      if (op == 12) {
        return diffuseColor.a;
      }
      if (op == 13) {
        return textureColor.a;
      }
      if (op == 14) {
        return uTextureFactor.a;
      }
      if (op == 16) {
        return currentColor.a;
      }
      return 0.0;
    }
    vec3 d3dApplyColorOp(int op, vec3 arg0, vec3 arg1, vec3 arg2,
        vec4 textureColor, vec4 currentColor, vec4 diffuseColor) {
      if (op == 2) {
        return arg1;
      }
      if (op == 3) {
        return arg2;
      }
      if (op == 4) {
        return arg1 * arg2;
      }
      if (op == 5) {
        return clamp(arg1 * arg2 * 2.0, 0.0, 1.0);
      }
      if (op == 6) {
        return clamp(arg1 * arg2 * 4.0, 0.0, 1.0);
      }
      if (op == 7) {
        return clamp(arg1 + arg2, 0.0, 1.0);
      }
      if (op == 8) {
        return clamp(arg1 + arg2 - vec3(0.5), 0.0, 1.0);
      }
      if (op == 9) {
        return clamp((arg1 + arg2 - vec3(0.5)) * 2.0, 0.0, 1.0);
      }
      if (op == 10) {
        return clamp(arg1 - arg2, 0.0, 1.0);
      }
      if (op == 11) {
        return clamp(arg1 + arg2 - arg1 * arg2, 0.0, 1.0);
      }
      if (op == 12 || op == 13 || op == 14 || op == 16) {
        float factor = d3dCombinerBlendFactor(op, textureColor, currentColor, diffuseColor);
        return mix(arg2, arg1, factor);
      }
      if (op == 24) {
        return d3dDotProduct3(arg1, arg2);
      }
      if (op == 25) {
        return clamp(arg0 + arg1 * arg2, 0.0, 1.0);
      }
      if (op == 26) {
        return clamp(arg0 * arg1 + (vec3(1.0) - arg0) * arg2, 0.0, 1.0);
      }
      return currentColor.rgb;
    }
    float d3dApplyAlphaOp(int op, float arg0, float arg1, float arg2,
        vec4 textureColor, vec4 currentColor, vec4 diffuseColor) {
      if (op == 2) {
        return arg1;
      }
      if (op == 3) {
        return arg2;
      }
      if (op == 4) {
        return arg1 * arg2;
      }
      if (op == 5) {
        return clamp(arg1 * arg2 * 2.0, 0.0, 1.0);
      }
      if (op == 6) {
        return clamp(arg1 * arg2 * 4.0, 0.0, 1.0);
      }
      if (op == 7) {
        return clamp(arg1 + arg2, 0.0, 1.0);
      }
      if (op == 8) {
        return clamp(arg1 + arg2 - 0.5, 0.0, 1.0);
      }
      if (op == 9) {
        return clamp((arg1 + arg2 - 0.5) * 2.0, 0.0, 1.0);
      }
      if (op == 10) {
        return clamp(arg1 - arg2, 0.0, 1.0);
      }
      if (op == 11) {
        return clamp(arg1 + arg2 - arg1 * arg2, 0.0, 1.0);
      }
      if (op == 12 || op == 13 || op == 14 || op == 16) {
        float factor = d3dCombinerBlendFactor(op, textureColor, currentColor, diffuseColor);
        return mix(arg2, arg1, factor);
      }
      if (op == 25) {
        return clamp(arg0 + arg1 * arg2, 0.0, 1.0);
      }
      if (op == 26) {
        return clamp(arg0 * arg1 + (1.0 - arg0) * arg2, 0.0, 1.0);
      }
      return currentColor.a;
    }
    vec3 d3dStage0Color(vec4 diffuseColor, vec4 textureColor, vec4 tempColor) {
      if (uStage0ColorOp == 1) {
        return diffuseColor.rgb;
      }
      vec3 arg0 = d3dCombinerColorArg(uStage0ColorArg0, textureColor, diffuseColor, diffuseColor, tempColor);
      vec3 arg1 = d3dCombinerColorArg(uStage0ColorArg1, textureColor, diffuseColor, diffuseColor, tempColor);
      vec3 arg2 = d3dCombinerColorArg(uStage0ColorArg2, textureColor, diffuseColor, diffuseColor, tempColor);
      return d3dApplyColorOp(uStage0ColorOp, arg0, arg1, arg2, textureColor, diffuseColor, diffuseColor);
    }
    float d3dCombinerAlphaArg(int arg, vec4 textureColor, vec4 currentColor, vec4 diffuseColor, vec4 tempColor) {
      vec4 source = d3dCombinerSource(arg, textureColor, currentColor, diffuseColor, tempColor);
      float value = source.a;
      if ((arg & 16) != 0) {
        value = 1.0 - value;
      }
      return value;
    }
    float d3dStage0Alpha(vec4 diffuseColor, vec4 textureColor, vec4 tempColor) {
      if (uStage0AlphaOp == 1) {
        return diffuseColor.a;
      }
      float arg0 = d3dCombinerAlphaArg(uStage0AlphaArg0, textureColor, diffuseColor, diffuseColor, tempColor);
      float arg1 = d3dCombinerAlphaArg(uStage0AlphaArg1, textureColor, diffuseColor, diffuseColor, tempColor);
      float arg2 = d3dCombinerAlphaArg(uStage0AlphaArg2, textureColor, diffuseColor, diffuseColor, tempColor);
      if (uStage0AlphaOp == 24) {
        vec3 colorArg1 = d3dCombinerColorArg(uStage0AlphaArg1, textureColor, diffuseColor, diffuseColor, tempColor);
        vec3 colorArg2 = d3dCombinerColorArg(uStage0AlphaArg2, textureColor, diffuseColor, diffuseColor, tempColor);
        return d3dDotProduct3(colorArg1, colorArg2).r;
      }
      return d3dApplyAlphaOp(uStage0AlphaOp, arg0, arg1, arg2, textureColor, diffuseColor, diffuseColor);
    }
    vec3 d3dStage1Color(vec4 diffuseColor, vec4 textureColor, vec4 currentColor, vec4 tempColor) {
      if (uStage1ColorOp == 1) {
        return currentColor.rgb;
      }
      vec3 arg0 = d3dCombinerColorArg(uStage1ColorArg0, textureColor, currentColor, diffuseColor, tempColor);
      vec3 arg1 = d3dCombinerColorArg(uStage1ColorArg1, textureColor, currentColor, diffuseColor, tempColor);
      vec3 arg2 = d3dCombinerColorArg(uStage1ColorArg2, textureColor, currentColor, diffuseColor, tempColor);
      return d3dApplyColorOp(uStage1ColorOp, arg0, arg1, arg2, textureColor, currentColor, diffuseColor);
    }
    void main() {
      vec4 texture0Color = uUseTexture0
        ? d3dTextureSample(texture(uTexture0, vTexCoord0, uTexture0LodBias), uTexture0Semantic)
        : vec4(1.0);
      vec4 texture1Color = uUseTexture1
        ? d3dTextureSample(texture(uTexture1, vTexCoord1, uTexture1LodBias), uTexture1Semantic)
        : vec4(1.0);
      vec4 stage0ComputedColor = vec4(
        d3dStage0Color(vColor, texture0Color, vec4(0.0)),
        d3dStage0Alpha(vColor, texture0Color, vec4(0.0))
      );
      vec4 stage0CurrentColor = uStage0ResultArg == 5 ? vColor : stage0ComputedColor;
      vec4 stage0TempColor = uStage0ResultArg == 5 ? stage0ComputedColor : vec4(0.0);
      vec4 color = vec4(
        d3dStage1Color(vColor, texture1Color, stage0CurrentColor, stage0TempColor),
        stage0CurrentColor.a
      );
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
    texCoord1: gl.getAttribLocation(program, "aTexCoord1"),
    scale: gl.getUniformLocation(program, "uScale"),
    useTransforms: gl.getUniformLocation(program, "uUseTransforms"),
    world: gl.getUniformLocation(program, "uWorld"),
    view: gl.getUniformLocation(program, "uView"),
    projection: gl.getUniformLocation(program, "uProjection"),
    useTexture0Transform: gl.getUniformLocation(program, "uUseTexture0Transform"),
    texture0Transform: gl.getUniformLocation(program, "uTexture0Transform"),
    useTexture1Transform: gl.getUniformLocation(program, "uUseTexture1Transform"),
    texture1Transform: gl.getUniformLocation(program, "uTexture1Transform"),
    useTexture0: gl.getUniformLocation(program, "uUseTexture0"),
    texture0: gl.getUniformLocation(program, "uTexture0"),
    texture0LodBias: gl.getUniformLocation(program, "uTexture0LodBias"),
    texture0Semantic: gl.getUniformLocation(program, "uTexture0Semantic"),
    useTexture1: gl.getUniformLocation(program, "uUseTexture1"),
    texture1: gl.getUniformLocation(program, "uTexture1"),
    texture1LodBias: gl.getUniformLocation(program, "uTexture1LodBias"),
    texture1Semantic: gl.getUniformLocation(program, "uTexture1Semantic"),
    textureFactor: gl.getUniformLocation(program, "uTextureFactor"),
    stage0ColorOp: gl.getUniformLocation(program, "uStage0ColorOp"),
    stage0ColorArg0: gl.getUniformLocation(program, "uStage0ColorArg0"),
    stage0ColorArg1: gl.getUniformLocation(program, "uStage0ColorArg1"),
    stage0ColorArg2: gl.getUniformLocation(program, "uStage0ColorArg2"),
    stage0AlphaOp: gl.getUniformLocation(program, "uStage0AlphaOp"),
    stage0AlphaArg0: gl.getUniformLocation(program, "uStage0AlphaArg0"),
    stage0AlphaArg1: gl.getUniformLocation(program, "uStage0AlphaArg1"),
    stage0AlphaArg2: gl.getUniformLocation(program, "uStage0AlphaArg2"),
    stage0ResultArg: gl.getUniformLocation(program, "uStage0ResultArg"),
    stage1ColorOp: gl.getUniformLocation(program, "uStage1ColorOp"),
    stage1ColorArg0: gl.getUniformLocation(program, "uStage1ColorArg0"),
    stage1ColorArg1: gl.getUniformLocation(program, "uStage1ColorArg1"),
    stage1ColorArg2: gl.getUniformLocation(program, "uStage1ColorArg2"),
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

function isIdentityD3DMatrix(matrix) {
  if (!matrix || matrix.length !== 16) {
    return false;
  }
  for (let index = 0; index < 16; ++index) {
    const expected = index % 5 === 0 ? 1 : 0;
    if (Math.abs(matrix[index] - expected) > 0.000001) {
      return false;
    }
  }
  return true;
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
    case D3DTSS_MIPMAPLODBIAS:
    case D3DTSS_MAXMIPLEVEL:
      return 0;
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
    maxMipLevel: value("maxMipLevel", D3DTSS_MAXMIPLEVEL),
    maxAnisotropy: Number(textureStage?.maxAnisotropy ?? 1) >>> 0,
    mipMapLodBias: value("mipMapLodBias", D3DTSS_MIPMAPLODBIAS),
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
    textureFactor: Number(renderState.textureFactor ?? 0) >>> 0,
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

function applyD3D8RenderState(renderState, options = {}) {
  const state = normalizeD3D8RenderState(renderState);
  const cullEnabled = state.cullMode === D3DCULL_CW || state.cullMode === D3DCULL_CCW;
  const cullFace = options.invertCullWinding
    ? (state.cullMode === D3DCULL_CW ? gl.FRONT : gl.BACK)
    : (state.cullMode === D3DCULL_CCW ? gl.FRONT : gl.BACK);
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
      invertWinding: Boolean(options.invertCullWinding),
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
  const vertexShaderFvf = Number(payload.vertexShaderFvf ?? 0) >>> 0;
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
  const texture0Transform = normalizeD3DMatrix(payload.transforms?.texture0);
  const texture1Transform = normalizeD3DMatrix(payload.transforms?.texture1);
  const transformMask = Number(payload.transformMask ?? 0) >>> 0;
  const useTransforms = transformMask === 7 && world !== null && view !== null && projection !== null;
  // Render2D emits already-normalized clip-space vertices under identity
  // matrices; D3D's screen-space winding lands opposite WebGL's cull test.
  const usesIdentityClipSpace =
    useTransforms &&
    isIdentityD3DMatrix(world) &&
    isIdentityD3DMatrix(view) &&
    isIdentityD3DMatrix(projection);
  const renderState = normalizeD3D8RenderState(payload.renderState);
  const vertexLayout = d3d8VertexLayoutInfo(vertexShaderFvf, vertexStride);
  const texture0Id = Number(d3d8BoundTextures.get(0) ?? 0) >>> 0;
  const texture0Resource = texture0Id !== 0 ? d3d8Textures.get(texture0Id) : null;
  const texture0Ready = Boolean(texture0Resource?.initializedLevels?.has("0"));
  const texture1Id = Number(d3d8BoundTextures.get(1) ?? 0) >>> 0;
  const texture1Resource = texture1Id !== 0 ? d3d8Textures.get(texture1Id) : null;
  const texture1Ready = Boolean(texture1Resource?.initializedLevels?.has("0"));
  const texture0Coordinates = textureStageCoordinateInfo(
    renderState.textureStages[0],
    0,
    vertexStride,
    vertexLayout,
    texture0Transform,
  );
  const texture1Coordinates = textureStageCoordinateInfo(
    renderState.textureStages[1],
    1,
    vertexStride,
    vertexLayout,
    texture1Transform,
  );
  const canSampleTexture0 = Boolean(texture0Ready && texture0Coordinates.supported);
  const canSampleTexture1 = Boolean(texture1Ready && texture1Coordinates.supported);
  const texture0SemanticMode = canSampleTexture0 ? d3d8TextureSemanticMode(texture0Resource) : 0;
  const texture1SemanticMode = canSampleTexture1 ? d3d8TextureSemanticMode(texture1Resource) : 0;
  const appliedTexture0Combiner = textureStageCombinerInfo(renderState.textureStages[0], 0, canSampleTexture0);
  const appliedStage1Combiner = textureStageCombinerInfo(renderState.textureStages[1], 1, canSampleTexture1);
  let appliedRenderState = null;
  let appliedTexture0Sampler = null;
  let appliedTexture1Sampler = null;
  let drawOk = false;
  syncCanvasSize();
  let centerPixel = sampleCanvasPixel(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2));

  if (gl && glPrimitive && usePersistentBuffers && vertexByteSize > 0 && indexByteSize > 0 &&
      vertexStride >= 12 && indexCount > 0 && (indexSize === 2 || indexSize === 4)) {
    const bridgeProgram = ensureD3D8DrawProgram();
    gl.useProgram(bridgeProgram.program);
    appliedRenderState = applyD3D8RenderState(renderState, {
      invertCullWinding: usesIdentityClipSpace,
    });
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexResource.buffer);
    gl.enableVertexAttribArray(bridgeProgram.position);
    gl.vertexAttribPointer(bridgeProgram.position, 3, gl.FLOAT, false, vertexStride, vertexByteOffset);
    if (bridgeProgram.diffuse >= 0 && vertexLayout.diffuseOffset !== null) {
      gl.enableVertexAttribArray(bridgeProgram.diffuse);
      gl.vertexAttribPointer(bridgeProgram.diffuse, 4, gl.UNSIGNED_BYTE, true,
        vertexStride, vertexByteOffset + vertexLayout.diffuseOffset);
    } else if (bridgeProgram.diffuse >= 0) {
      gl.disableVertexAttribArray(bridgeProgram.diffuse);
      gl.vertexAttrib4f(bridgeProgram.diffuse, 1, 1, 1, 1);
    }
    if (bridgeProgram.texCoord0 >= 0 && canSampleTexture0) {
      gl.enableVertexAttribArray(bridgeProgram.texCoord0);
      gl.vertexAttribPointer(bridgeProgram.texCoord0, 2, gl.FLOAT, false,
        vertexStride, vertexByteOffset + texture0Coordinates.offset);
    } else if (bridgeProgram.texCoord0 >= 0) {
      gl.disableVertexAttribArray(bridgeProgram.texCoord0);
      gl.vertexAttrib2f(bridgeProgram.texCoord0, 0, 0);
    }
    if (bridgeProgram.texCoord1 >= 0 && canSampleTexture1) {
      gl.enableVertexAttribArray(bridgeProgram.texCoord1);
      gl.vertexAttribPointer(bridgeProgram.texCoord1, 2, gl.FLOAT, false,
        vertexStride, vertexByteOffset + texture1Coordinates.offset);
    } else if (bridgeProgram.texCoord1 >= 0) {
      gl.disableVertexAttribArray(bridgeProgram.texCoord1);
      gl.vertexAttrib2f(bridgeProgram.texCoord1, 0, 0);
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
    if (bridgeProgram.useTexture0Transform) {
      gl.uniform1i(bridgeProgram.useTexture0Transform,
        canSampleTexture0 && texture0Coordinates.transformApplied ? 1 : 0);
    }
    if (bridgeProgram.texture0Transform && canSampleTexture0 && texture0Coordinates.transformApplied) {
      gl.uniformMatrix4fv(bridgeProgram.texture0Transform, false, texture0Transform);
    }
    if (bridgeProgram.useTexture1Transform) {
      gl.uniform1i(bridgeProgram.useTexture1Transform,
        canSampleTexture1 && texture1Coordinates.transformApplied ? 1 : 0);
    }
    if (bridgeProgram.texture1Transform && canSampleTexture1 && texture1Coordinates.transformApplied) {
      gl.uniformMatrix4fv(bridgeProgram.texture1Transform, false, texture1Transform);
    }
    if (bridgeProgram.useTexture0) {
      gl.uniform1i(bridgeProgram.useTexture0, canSampleTexture0 ? 1 : 0);
    }
    if (bridgeProgram.texture0) {
      gl.uniform1i(bridgeProgram.texture0, 0);
    }
    if (bridgeProgram.texture0LodBias) {
      const texture0LodBias = canSampleTexture0
        ? d3dDwordToFloat(renderState.textureStages[0].mipMapLodBias)
        : 0.0;
      gl.uniform1f(bridgeProgram.texture0LodBias, texture0LodBias);
    }
    if (bridgeProgram.texture0Semantic) {
      gl.uniform1i(bridgeProgram.texture0Semantic, texture0SemanticMode);
    }
    if (bridgeProgram.useTexture1) {
      gl.uniform1i(bridgeProgram.useTexture1, canSampleTexture1 ? 1 : 0);
    }
    if (bridgeProgram.texture1) {
      gl.uniform1i(bridgeProgram.texture1, 1);
    }
    if (bridgeProgram.texture1LodBias) {
      const texture1LodBias = canSampleTexture1
        ? d3dDwordToFloat(renderState.textureStages[1].mipMapLodBias)
        : 0.0;
      gl.uniform1f(bridgeProgram.texture1LodBias, texture1LodBias);
    }
    if (bridgeProgram.texture1Semantic) {
      gl.uniform1i(bridgeProgram.texture1Semantic, texture1SemanticMode);
    }
    if (bridgeProgram.textureFactor) {
      gl.uniform4fv(bridgeProgram.textureFactor,
        new Float32Array(d3dColorToNormalizedRgba(renderState.textureFactor)));
    }
    if (bridgeProgram.stage0ColorOp) {
      gl.uniform1i(bridgeProgram.stage0ColorOp, renderState.textureStages[0].colorOp);
    }
    if (bridgeProgram.stage0ColorArg0) {
      gl.uniform1i(bridgeProgram.stage0ColorArg0, renderState.textureStages[0].colorArg0);
    }
    if (bridgeProgram.stage0ColorArg1) {
      gl.uniform1i(bridgeProgram.stage0ColorArg1, renderState.textureStages[0].colorArg1);
    }
    if (bridgeProgram.stage0ColorArg2) {
      gl.uniform1i(bridgeProgram.stage0ColorArg2, renderState.textureStages[0].colorArg2);
    }
    if (bridgeProgram.stage0AlphaOp) {
      gl.uniform1i(bridgeProgram.stage0AlphaOp, renderState.textureStages[0].alphaOp);
    }
    if (bridgeProgram.stage0AlphaArg0) {
      gl.uniform1i(bridgeProgram.stage0AlphaArg0, renderState.textureStages[0].alphaArg0);
    }
    if (bridgeProgram.stage0AlphaArg1) {
      gl.uniform1i(bridgeProgram.stage0AlphaArg1, renderState.textureStages[0].alphaArg1);
    }
    if (bridgeProgram.stage0AlphaArg2) {
      gl.uniform1i(bridgeProgram.stage0AlphaArg2, renderState.textureStages[0].alphaArg2);
    }
    if (bridgeProgram.stage0ResultArg) {
      gl.uniform1i(bridgeProgram.stage0ResultArg, renderState.textureStages[0].resultArg);
    }
    if (bridgeProgram.stage1ColorOp) {
      gl.uniform1i(bridgeProgram.stage1ColorOp, renderState.textureStages[1].colorOp);
    }
    if (bridgeProgram.stage1ColorArg0) {
      gl.uniform1i(bridgeProgram.stage1ColorArg0, renderState.textureStages[1].colorArg0);
    }
    if (bridgeProgram.stage1ColorArg1) {
      gl.uniform1i(bridgeProgram.stage1ColorArg1, renderState.textureStages[1].colorArg1);
    }
    if (bridgeProgram.stage1ColorArg2) {
      gl.uniform1i(bridgeProgram.stage1ColorArg2, renderState.textureStages[1].colorArg2);
    }
    if (canSampleTexture0) {
      const previousActiveTexture = gl.getParameter(gl.ACTIVE_TEXTURE);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture0Resource.texture);
      appliedTexture0Sampler = applyD3D8TextureSamplerToBoundTexture(
        0,
        renderState.textureStages[0],
        texture0Resource,
      );
      gl.activeTexture(previousActiveTexture);
    }
    if (canSampleTexture1) {
      const previousActiveTexture = gl.getParameter(gl.ACTIVE_TEXTURE);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, texture1Resource.texture);
      appliedTexture1Sampler = applyD3D8TextureSamplerToBoundTexture(
        1,
        renderState.textureStages[1],
        texture1Resource,
      );
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
    vertexShaderFvf,
    vertexLayout,
    indexBufferId,
    indexByteOffset,
    indexBytes: indexByteSize,
    indexCount,
    indexSize,
    usedPersistentBuffers: usePersistentBuffers,
    transformMask,
    usedTransforms: Boolean(useTransforms),
    usedIdentityClipSpace: Boolean(usesIdentityClipSpace),
    renderState,
    appliedRenderState,
    boundTextures: Object.fromEntries(d3d8BoundTextures),
    texture0: {
      id: texture0Id,
      ready: texture0Ready,
      sampled: canSampleTexture0,
      levels: texture0Resource?.levels ?? 0,
      initializedLevels: texture0Resource
        ? Array.from(texture0Resource.initializedLevels).map((level) => Number(level)).sort((a, b) => a - b)
        : [],
      completeMipChain: textureHasCompleteMipChain(texture0Resource),
      texCoordIndex: texture0Coordinates.texCoordIndex,
      texCoordMode: texture0Coordinates.mode,
      texCoordModeName: texture0Coordinates.modeName,
      texCoordSet: texture0Coordinates.coordSet,
      texCoordOffset: canSampleTexture0 ? texture0Coordinates.offset : null,
      textureTransformFlags: texture0Coordinates.textureTransformFlags,
      textureTransformModeName: texture0Coordinates.textureTransformModeName,
      textureTransformSupported: texture0Coordinates.transformSupported,
      textureTransformApplied: Boolean(canSampleTexture0 && texture0Coordinates.transformApplied),
      textureTransformMatrix: texture0Transform !== null ? Array.from(texture0Transform) : null,
      texCoordSupported: texture0Coordinates.supported,
      width: texture0Resource?.width ?? 0,
      height: texture0Resource?.height ?? 0,
      format: texture0Resource?.format ?? 0,
      storage: texture0Resource?.storage ?? null,
      semantic: texture0Resource?.semantic ?? null,
      semanticMode: texture0SemanticMode,
      uploads: texture0Resource?.uploads ?? 0,
      sampler: appliedTexture0Sampler ?? texture0Resource?.samplerState ?? null,
      combiner: appliedTexture0Combiner,
    },
    texture1: {
      id: texture1Id,
      ready: texture1Ready,
      sampled: canSampleTexture1,
      levels: texture1Resource?.levels ?? 0,
      initializedLevels: texture1Resource
        ? Array.from(texture1Resource.initializedLevels).map((level) => Number(level)).sort((a, b) => a - b)
        : [],
      completeMipChain: textureHasCompleteMipChain(texture1Resource),
      texCoordIndex: texture1Coordinates.texCoordIndex,
      texCoordMode: texture1Coordinates.mode,
      texCoordModeName: texture1Coordinates.modeName,
      texCoordSet: texture1Coordinates.coordSet,
      texCoordOffset: canSampleTexture1 ? texture1Coordinates.offset : null,
      textureTransformFlags: texture1Coordinates.textureTransformFlags,
      textureTransformModeName: texture1Coordinates.textureTransformModeName,
      textureTransformSupported: texture1Coordinates.transformSupported,
      textureTransformApplied: Boolean(canSampleTexture1 && texture1Coordinates.transformApplied),
      textureTransformMatrix: texture1Transform !== null ? Array.from(texture1Transform) : null,
      texCoordSupported: texture1Coordinates.supported,
      width: texture1Resource?.width ?? 0,
      height: texture1Resource?.height ?? 0,
      format: texture1Resource?.format ?? 0,
      storage: texture1Resource?.storage ?? null,
      semantic: texture1Resource?.semantic ?? null,
      semanticMode: texture1SemanticMode,
      uploads: texture1Resource?.uploads ?? 0,
      sampler: appliedTexture1Sampler ?? texture1Resource?.samplerState ?? null,
      combiner: appliedStage1Combiner,
    },
    stage1Combiner: appliedStage1Combiner,
    textureFactor: renderState.textureFactor,
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
  harnessState.browserRuntimeAssets = moduleState.browserRuntimeAssets ?? harnessState.browserRuntimeAssets;
  harnessState.startupAssets = moduleState.startupAssets ?? harnessState.startupAssets;
  harnessState.dataSummary = moduleState.dataSummary ?? harnessState.dataSummary;
  harnessState.originalEngineStartup = moduleState.originalEngineStartup ?? harnessState.originalEngineStartup;
}

// ---- Win32 GDI font/surface browser bridge ----------------------------------
// Backs the original WW3D FontCharsClass / Render2DSentenceClass text path.
// The C++ side (wasm_win32_gdi_browser.cpp) calls these synchronous hooks via
// EM_ASM; they rasterize glyphs through a Canvas 2D context and write BGR
// pixels back into the wasm DIB-section buffer.
let gdiCanvas = null;
let gdiCtx = null;

function gdiEnsureContext() {
  if (gdiCtx) {
    return gdiCtx;
  }
  gdiCanvas = document.createElement("canvas");
  gdiCtx = gdiCanvas.getContext("2d", { willReadFrequently: true });
  return gdiCtx;
}

function gdiFontCss(face, logicalHeight, weight, italic) {
  const px = Math.max(1, Math.abs((logicalHeight | 0) || 16));
  const wght = weight || 400;
  const ital = italic ? "italic " : "";
  const family = face && face.length ? JSON.stringify(String(face)) : "Arial";
  return `${ital}${wght} ${px}px ${family}`;
}

function gdiCssColor(rgb) {
  const v = rgb >>> 0;
  const r = v & 0xff;
  const g = (v >> 8) & 0xff;
  const b = (v >> 16) & 0xff;
  return `rgb(${r},${g},${b})`;
}

// Measure: synchronous canvas.measureText + fontBoundingBox metrics.  Returns
// {width,height,ascent,overhang} in device pixels.  overhang is left at 0
// because canvas TextMetrics exposes no direct equivalent; the original
// FontCharsClass zeroes overhang for the Generals/Arial path regardless.
function cncGdiMeasure(face, logicalHeight, weight, italic, str) {
  const ctx = gdiEnsureContext();
  if (!ctx || typeof str !== "string" || str.length === 0) {
    return null;
  }
  ctx.font = gdiFontCss(face, logicalHeight, weight, italic);
  const m = ctx.measureText(str);
  const px = Math.max(1, Math.abs((logicalHeight | 0) || 16));
  const ascent = Math.ceil(m.fontBoundingBoxAscent || (px * 0.8));
  const descent = Math.ceil(m.fontBoundingBoxDescent || (px * 0.2));
  const width = Math.ceil(m.width);
  return { width, height: ascent + descent, ascent, overhang: 0 };
}

// Rasterize one UTF-16 code unit at (x,y) honoring ETO_OPAQUE.  Writes 24bpp
// BGR, DWORD-padded stride, top-down into the wasm heap at bitsPtr.
function cncGdiRasterizeGlyph(
  face,
  logicalHeight,
  weight,
  italic,
  code,
  x,
  y,
  bitsPtr,
  bmpW,
  bmpH,
  stride,
  textColorRgb,
  bkColorRgb,
  opaque,
  heapu8,
) {
  const ctx = gdiEnsureContext();
  if (!ctx || bmpW <= 0 || bmpH <= 0 || stride < bmpW * 3) {
    return false;
  }
  if (!(heapu8 instanceof Uint8Array)) {
    return false;
  }
  if (gdiCanvas.width !== bmpW) {
    gdiCanvas.width = bmpW;
  }
  if (gdiCanvas.height !== bmpH) {
    gdiCanvas.height = bmpH;
  }
  ctx.font = gdiFontCss(face, logicalHeight, weight, italic);
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  if (opaque) {
    ctx.fillStyle = gdiCssColor(bkColorRgb);
    ctx.fillRect(0, 0, bmpW, bmpH);
  }
  ctx.fillStyle = gdiCssColor(textColorRgb);
  ctx.fillText(String.fromCharCode(code), x, y);
  const img = ctx.getImageData(0, 0, bmpW, bmpH).data;
  for (let row = 0; row < bmpH; row++) {
    let dst = (bitsPtr | 0) + row * stride;
    const srcRow = row * bmpW * 4;
    for (let col = 0; col < bmpW; col++) {
      const s = srcRow + col * 4;
      heapu8[dst++] = img[s + 2]; // B
      heapu8[dst++] = img[s + 1]; // G
      heapu8[dst++] = img[s + 0]; // R
    }
  }
  return true;
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
      cncGdiMeasure,
      cncGdiRasterizeGlyph,
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
      probeD3D8TwoTextureQuad: module.cwrap("cnc_port_probe_d3d8_two_texture_quad", "string", []),
      probeD3D8TextureMipChainDraw: module.cwrap("cnc_port_probe_d3d8_texture_mip_chain_draw", "string", ["number"]),
      probeD3D8TextureCombiner: module.cwrap("cnc_port_probe_d3d8_texture_combiner", "string", ["number"]),
      probeD3D8TexCoordIndex: module.cwrap("cnc_port_probe_d3d8_texcoord_index", "string", ["number"]),
      probeD3D8TextureTransform: module.cwrap("cnc_port_probe_d3d8_texture_transform", "string", ["number"]),
      probeD3D8LegacyTextureUpload: module.cwrap("cnc_port_probe_d3d8_legacy_texture_upload", "string", []),
      probeD3D8LegacyTextureDraw: module.cwrap("cnc_port_probe_d3d8_legacy_texture_draw", "string", ["number"]),
      probeD3D8DxtTextureDraw: module.cwrap("cnc_port_probe_d3d8_dxt_texture_draw", "string", ["number"]),
      probeWW3DAABox: module.cwrap("cnc_port_probe_ww3d_aabox", "string", []),
      probeWW3DRender2DTexturedQuad: module.cwrap(
        "cnc_port_probe_ww3d_render2d_textured_quad", "string", []),
      probeWW3DRender2DSentence: module.cwrap(
        "cnc_port_probe_ww3d_render2d_sentence", "string", []),
      probeWW3DDisplayString: module.cwrap(
        "cnc_port_probe_ww3d_display_string", "string", []),
      probeWW3DDisplayDrawImage: module.cwrap(
        "cnc_port_probe_ww3d_display_drawimage", "string", []),
      probeWW3DTerrainTile: module.cwrap(
        "cnc_port_probe_ww3d_terrain_tile", "string", []),
      probeWW3DTexturedMesh: module.cwrap(
        "cnc_port_probe_ww3d_textured_mesh", "string", []),
      probeWW3DShippedMesh: module.cwrap(
        "cnc_port_probe_ww3d_shipped_mesh", "string", ["string", "string"]),
      probeWW3DShippedMultiTextureMesh: module.cwrap(
        "cnc_port_probe_ww3d_shipped_multi_texture_mesh", "string", ["string", "string"]),
      probeWW3DSourceAssetLoad: module.cwrap(
        "cnc_port_probe_ww3d_source_asset_load", "string", []),
      probeWW3DFontChars: module.cwrap(
        "cnc_port_probe_ww3d_font_chars", "string", ["number", "string", "number"]),
      initOriginalWndProcInput: module.cwrap(
        "cnc_port_init_original_wndproc_input",
        "string",
        ["number", "number"],
      ),
      pumpOriginalWndProcInput: module.cwrap("cnc_port_pump_original_wndproc_input", "string", []),
      probeOriginalWndProcInput: module.cwrap("cnc_port_probe_original_wndproc_input", "string", []),
      probeGdiFont: module.cwrap("cnc_port_probe_gdi_font", "string", ["number", "string"]),
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
    browserRuntimeAssets: harnessState.browserRuntimeAssets,
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

function ensureFixedMemfsDirectory(fs, path) {
  let current = "";
  for (const part of String(path).split("/").filter(Boolean)) {
    if (part === "." || part === "..") {
      throw new Error(`Invalid fixed MEMFS directory: ${path}`);
    }
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

function readBigUInt32BE(bytes, offset) {
  return bytes[offset] * 0x1000000 +
    bytes[offset + 1] * 0x10000 +
    bytes[offset + 2] * 0x100 +
    bytes[offset + 3];
}

function writeBigUInt32BE(bytes, offset, value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error(`BIG archive integer out of range: ${value}`);
  }

  bytes[offset] = Math.floor(value / 0x1000000) & 0xff;
  bytes[offset + 1] = Math.floor(value / 0x10000) & 0xff;
  bytes[offset + 2] = Math.floor(value / 0x100) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function appendBytes(left, right) {
  const combined = new Uint8Array(left.byteLength + right.byteLength);
  combined.set(left, 0);
  combined.set(right, left.byteLength);
  return combined;
}

async function fetchByteRange(url, start, end) {
  const response = await fetch(url, {
    headers: {
      Range: `bytes=${start}-${end}`,
    },
  });
  if (response.status !== 206) {
    throw new Error(`Range fetch failed for ${url} ${start}-${end}: HTTP ${response.status}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const expectedLength = end - start + 1;
  if (bytes.byteLength !== expectedLength) {
    throw new Error(`Range fetch length mismatch for ${url} ${start}-${end}: ${bytes.byteLength} != ${expectedLength}`);
  }

  return bytes;
}

async function extractBigEntryFromUrl(url, entryName) {
  const wanted = String(entryName ?? "").replaceAll("/", "\\").toLowerCase();
  if (!wanted) {
    throw new Error("Missing BIG archive entry name");
  }

  const header = await fetchByteRange(url, 0, 15);
  const magic = String.fromCharCode(...header.subarray(0, 4));
  if (magic !== "BIGF") {
    throw new Error(`${url} is not a BIGF archive`);
  }

  const count = readBigUInt32BE(header, 8);
  if (count === 0 || count > 1000000) {
    throw new Error(`${url} has an invalid BIGF entry count: ${count}`);
  }

  const decoder = new TextDecoder("ascii");
  const directoryStart = 0x10;
  const chunkSize = 64 * 1024;
  let directoryBytes = new Uint8Array(0);
  let cursor = 0;

  const ensureDirectoryBytes = async (requiredLength) => {
    while (directoryBytes.byteLength < requiredLength) {
      const start = directoryStart + directoryBytes.byteLength;
      const next = await fetchByteRange(url, start, start + chunkSize - 1);
      if (next.byteLength === 0) {
        throw new Error(`${url} ended before BIGF directory entry ${entryName}`);
      }
      directoryBytes = appendBytes(directoryBytes, next);
    }
  };

  for (let index = 0; index < count; ++index) {
    await ensureDirectoryBytes(cursor + 9);
    const offset = readBigUInt32BE(directoryBytes, cursor);
    const size = readBigUInt32BE(directoryBytes, cursor + 4);
    const pathStart = cursor + 8;
    let pathEnd = -1;
    while (pathEnd < 0) {
      for (let scan = pathStart; scan < directoryBytes.byteLength; ++scan) {
        if (directoryBytes[scan] === 0) {
          pathEnd = scan;
          break;
        }
      }
      if (pathEnd < 0) {
        await ensureDirectoryBytes(directoryBytes.byteLength + 1);
      }
    }

    const path = decoder.decode(directoryBytes.subarray(pathStart, pathEnd));
    cursor = pathEnd + 1;
    if (path.replaceAll("/", "\\").toLowerCase() === wanted) {
      const bytes = await fetchByteRange(url, offset, offset + size - 1);
      return {
        path,
        offset,
        size,
        bytes,
        directoryBytes: directoryBytes.byteLength,
        indexedEntries: index + 1,
      };
    }
  }

  throw new Error(`${entryName} was not found in ${url}`);
}

function buildBigArchive(entries) {
  const encoder = new TextEncoder();
  const normalizedEntries = entries.map((entry) => {
    const path = String(entry.path ?? "").replaceAll("/", "\\");
    if (!path || path.includes("\0")) {
      throw new Error(`Invalid BIG archive entry path: ${path}`);
    }

    const pathBytes = encoder.encode(path);
    const bytes = entry.bytes instanceof Uint8Array ? entry.bytes : new Uint8Array(entry.bytes ?? []);
    return {
      ...entry,
      path,
      pathBytes,
      bytes,
    };
  });

  const directoryBytes = normalizedEntries.reduce(
    (sum, entry) => sum + 8 + entry.pathBytes.byteLength + 1,
    0,
  );
  const dataStart = 0x10 + directoryBytes;
  const totalBytes = dataStart + normalizedEntries.reduce(
    (sum, entry) => sum + entry.bytes.byteLength,
    0,
  );
  if (totalBytes > 0xffffffff) {
    throw new Error(`Synthesized BIG archive is too large: ${totalBytes}`);
  }

  const archiveBytes = new Uint8Array(totalBytes);
  archiveBytes.set([0x42, 0x49, 0x47, 0x46], 0); // BIGF
  writeBigUInt32BE(archiveBytes, 4, totalBytes);
  writeBigUInt32BE(archiveBytes, 8, normalizedEntries.length);
  writeBigUInt32BE(archiveBytes, 12, 0);

  let directoryCursor = 0x10;
  let dataCursor = dataStart;
  const manifest = [];
  for (const entry of normalizedEntries) {
    writeBigUInt32BE(archiveBytes, directoryCursor, dataCursor);
    writeBigUInt32BE(archiveBytes, directoryCursor + 4, entry.bytes.byteLength);
    archiveBytes.set(entry.pathBytes, directoryCursor + 8);
    archiveBytes[directoryCursor + 8 + entry.pathBytes.byteLength] = 0;
    archiveBytes.set(entry.bytes, dataCursor);
    manifest.push({
      path: entry.path,
      bytes: entry.bytes.byteLength,
      offset: dataCursor,
      sourceOffset: entry.offset,
      sourceArchive: entry.sourceArchive,
      sourceIndexedEntries: entry.indexedEntries,
      sourceDirectoryBytes: entry.directoryBytes,
      reader: "browser fetch Range",
    });
    directoryCursor += 8 + entry.pathBytes.byteLength + 1;
    dataCursor += entry.bytes.byteLength;
  }

  return {
    bytes: archiveBytes,
    entries: manifest,
    directoryBytes,
    dataStart,
  };
}

async function mountRangeBackedArchiveSet(payload = {}) {
  const moduleResult = await getWasmModuleForArchives("mountRangeBackedArchiveSet");
  if (moduleResult.error) {
    return { ok: false, command: moduleResult.command, error: moduleResult.error };
  }

  const archiveInputs = Array.isArray(payload.archives) ? payload.archives : [];
  if (archiveInputs.length === 0) {
    return { ok: false, command: "mountRangeBackedArchiveSet", error: "Missing archive list" };
  }

  const baseDirectory = normalizeAssetDirectory(String(payload.path ?? "/assets/runtime"));
  if (!baseDirectory) {
    return {
      ok: false,
      command: "mountRangeBackedArchiveSet",
      error: `Archive directory must stay under /assets/: ${payload.path}`,
    };
  }

  const archives = [];
  const archiveProbes = [];
  for (const input of archiveInputs) {
    const archive = archivePathFromPayload(input, baseDirectory);
    if (archive.error) {
      return { ok: false, command: "mountRangeBackedArchiveSet", error: archive.error, archives };
    }

    const entryNames = Array.isArray(input.entries) ? input.entries : [];
    if (entryNames.length === 0) {
      return {
        ok: false,
        command: "mountRangeBackedArchiveSet",
        error: `Missing range-backed entries for ${archive.name}`,
        archives,
      };
    }

    const entries = [];
    try {
      for (const entryName of entryNames) {
        const entry = await extractBigEntryFromUrl(archive.url, entryName);
        entries.push({
          ...entry,
          sourceArchive: String(input.sourceArchive ?? archive.url),
        });
      }
    } catch (error) {
      return {
        ok: false,
        command: "mountRangeBackedArchiveSet",
        error: error?.message ?? String(error),
        archives,
      };
    }

    let generated;
    try {
      generated = buildBigArchive(entries);
      ensureMemfsDirectory(moduleResult.wasmModule.fs, parentDirectory(archive.memfsPath));
      moduleResult.wasmModule.fs.writeFile(archive.memfsPath, generated.bytes);
    } catch (error) {
      return {
        ok: false,
        command: "mountRangeBackedArchiveSet",
        error: error?.message ?? String(error),
        archives,
      };
    }

    const assetProbe = payload.verifyEach === false
      ? null
      : probeArchive(moduleResult.wasmModule, archive.memfsPath);
    const mountedArchive = {
      name: archive.name,
      path: archive.memfsPath,
      bytes: generated.bytes.byteLength,
      sourceBytes: Number(input.expectedSourceBytes ?? input.sourceBytes ?? 0),
      directoryBytes: generated.directoryBytes,
      dataStart: generated.dataStart,
      entries: generated.entries,
      entryCount: generated.entries.length,
      reader: "browser fetch Range -> synthesized BIG",
      storage: "range-backed-subset-big",
    };
    archives.push(mountedArchive);
    if (assetProbe) {
      archiveProbes.push({
        name: archive.name,
        path: archive.memfsPath,
        ok: Boolean(assetProbe.ok),
        indexedFiles: assetProbe.indexedFiles,
        sampleBytes: assetProbe.sampleBytes,
      });
    }
  }

  const probePath = `${baseDirectory}/*.big`;
  const aggregateProbe = probeArchive(moduleResult.wasmModule, probePath);
  rememberMountedArchives(archives);

  const allArchiveProbesOk = archiveProbes.every((archive) => archive.ok);
  const ok = Boolean(aggregateProbe?.ok) && allArchiveProbesOk;
  const totalBytes = archives.reduce((sum, archive) => sum + archive.bytes, 0);
  const sourceTotalBytes = archives.reduce((sum, archive) => sum + archive.sourceBytes, 0);
  const archiveSet = {
    path: baseDirectory,
    probePath,
    archiveCount: archives.length,
    totalBytes,
    sourceTotalBytes,
    archives,
    probes: archiveProbes,
    reader: "browser fetch Range -> synthesized BIG -> Win32BIGFileSystem",
    storage: "range-backed-subset-big",
  };
  if (ok) {
    registerArchiveSet(moduleResult.wasmModule, archiveSet);
  }

  recordLog("range-backed archive set mounted", {
    path: baseDirectory,
    archiveCount: archives.length,
    totalBytes,
    sourceTotalBytes,
    ok,
  });

  return {
    ok,
    command: "mountRangeBackedArchiveSet",
    state: snapshotState(),
    archiveSet,
  };
}

async function mountBigArchiveEntry(payload = {}) {
  const moduleResult = await getWasmModuleForArchives("mountBigArchiveEntry");
  if (moduleResult.error) {
    return { ok: false, command: moduleResult.command, error: moduleResult.error };
  }

  try {
    const url = String(payload.url ?? "");
    const mountPath = String(payload.path ?? "").replaceAll("\\", "/");
    if (!url) {
      throw new Error("Missing archive URL");
    }
    if (!mountPath.startsWith("/") ||
        mountPath.split("/").some((part) => part === "." || part === "..")) {
      throw new Error(`Invalid MEMFS mount path: ${mountPath}`);
    }

    const entry = await extractBigEntryFromUrl(url, payload.entry);
    ensureFixedMemfsDirectory(moduleResult.wasmModule.fs, parentDirectory(mountPath));
    moduleResult.wasmModule.fs.writeFile(mountPath, entry.bytes);
    recordLog("BIG archive entry mounted", {
      path: mountPath,
      bytes: entry.size,
      offset: entry.offset,
      archiveEntry: entry.path,
      sourceArchive: String(payload.sourceArchive ?? url),
    });

    return {
      ok: true,
      command: "mountBigArchiveEntry",
      asset: {
        path: mountPath,
        sourceArchive: String(payload.sourceArchive ?? url),
        archiveUrl: url,
        archiveEntry: entry.path,
        offset: entry.offset,
        bytes: entry.size,
        directoryBytes: entry.directoryBytes,
        indexedEntries: entry.indexedEntries,
        reader: "browser fetch Range",
      },
      state: snapshotState(),
    };
  } catch (error) {
    return {
      ok: false,
      command: "mountBigArchiveEntry",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function mountShippedMeshAsset(payload = {}) {
  const moduleResult = await getWasmModuleForArchives("mountShippedMeshAsset");
  if (moduleResult.error) {
    return { ok: false, command: moduleResult.command, error: moduleResult.error };
  }

  const requestedPath = String(payload.path ?? "").replaceAll("\\", "/");
  const mountPaths = new Map([
    ["Art/W3D/CINE_Moon.W3D", "/Art/W3D/CINE_Moon.W3D"],
    ["Art/Textures/cine_moon.dds", "/art/textures/cine_moon.dds"],
  ]);
  const path = mountPaths.get(requestedPath);
  if (!path) {
    return {
      ok: false,
      command: "mountShippedMeshAsset",
      error: `Unsupported shipped mesh asset path: ${requestedPath}`,
    };
  }

  const rawBytes = payload.bytes;
  const bytes = rawBytes instanceof Uint8Array ? rawBytes : new Uint8Array(rawBytes ?? []);
  if (bytes.byteLength === 0) {
    return { ok: false, command: "mountShippedMeshAsset", error: "Missing asset bytes" };
  }

  ensureFixedMemfsDirectory(moduleResult.wasmModule.fs, parentDirectory(path));
  moduleResult.wasmModule.fs.writeFile(path, bytes);
  recordLog("shipped mesh asset mounted", {
    path,
    bytes: bytes.byteLength,
    sourceArchive: String(payload.sourceArchive ?? ""),
  });

  return {
    ok: true,
    command: "mountShippedMeshAsset",
    asset: {
      path,
      sourceArchive: String(payload.sourceArchive ?? ""),
      archiveEntry: requestedPath,
      bytes: bytes.byteLength,
    },
    state: snapshotState(),
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
    case "mountRangeBackedArchiveSet":
      return mountRangeBackedArchiveSet(payload);
    case "mountBigArchiveEntry":
      return mountBigArchiveEntry(payload);
    case "mountShippedMeshAsset":
      return mountShippedMeshAsset(payload);
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
          && browserProbe?.texture0?.sampler?.d3d?.minFilter === D3DTEXF_LINEAR
          && browserProbe?.texture0?.sampler?.d3d?.magFilter === D3DTEXF_POINT
          && browserProbe?.texture0?.sampler?.d3d?.mipFilter === D3DTEXF_NONE
          && browserProbe?.texture0?.sampler?.d3d?.addressU === D3DTADDRESS_CLAMP
          && browserProbe?.texture0?.sampler?.d3d?.addressV === D3DTADDRESS_WRAP
          && browserProbe?.texture0?.sampler?.gl?.minFilter === gl.LINEAR
          && browserProbe?.texture0?.sampler?.gl?.magFilter === gl.NEAREST
          && browserProbe?.texture0?.sampler?.gl?.wrapS === gl.CLAMP_TO_EDGE
          && browserProbe?.texture0?.sampler?.gl?.wrapT === gl.REPEAT
          && browserProbe?.texture0?.sampler?.usedMipmaps === false
          && textureProbe?.lastSampler?.textureId === probe.texture?.id
          && browserProbe?.texture0?.combiner?.colorOp === D3DTOP_MODULATE
          && browserProbe?.texture0?.combiner?.colorArg1 === D3DTA_TEXTURE
          && browserProbe?.texture0?.combiner?.colorArg2 === D3DTA_DIFFUSE
          && browserProbe?.texture0?.combiner?.opName === "modulate"
          && browserProbe?.texture0?.combiner?.arg1Name === "texture"
          && browserProbe?.texture0?.combiner?.arg2Name === "diffuse"
          && browserProbe?.texture0?.combiner?.supported === true
          && browserProbe?.texture0?.id === probe.texture?.id
          && browserProbe?.texture0?.ready === true
          && browserProbe?.texture0?.sampled === true
          && browserProbe?.texture0?.texCoordIndex === 0
          && browserProbe?.texture0?.texCoordModeName === "passthru"
          && browserProbe?.texture0?.texCoordSet === 0
          && browserProbe?.texture0?.texCoordOffset === D3D8_XYZNDUV_TEXCOORD0_OFFSET
          && browserProbe?.texture0?.textureTransformFlags === D3DTTFF_DISABLE
          && browserProbe?.texture0?.texCoordSupported === true
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
    case "d3d8TwoTextureQuad":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 two-texture quad probe cannot run" };
        }
        const beforeTextures = harnessState.graphics.d3d8Textures ?? {};
        const probe = parseModuleState(wasmModule.probeD3D8TwoTextureQuad());
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const textureProbe = harnessState.graphics.d3d8Textures ?? null;
        const textureDelta = {
          creates: (textureProbe?.creates ?? 0) - (beforeTextures.creates ?? 0),
          updates: (textureProbe?.updates ?? 0) - (beforeTextures.updates ?? 0),
          binds: (textureProbe?.binds ?? 0) - (beforeTextures.binds ?? 0),
          releaseUnbinds: (textureProbe?.releaseUnbinds ?? 0) - (beforeTextures.releaseUnbinds ?? 0),
          releases: (textureProbe?.releases ?? 0) - (beforeTextures.releases ?? 0),
          samplerApplications: (textureProbe?.samplerApplications ?? 0) -
            (beforeTextures.samplerApplications ?? 0),
        };
        const expectedCenter = probe.textures?.stage1?.expectedCenter ?? [0, 0, 255, 255];
        const centerPixelOk = Array.isArray(browserProbe?.centerPixel) &&
          pixelsApproximatelyEqual(browserProbe.centerPixel, expectedCenter, 2);
        const ok = Boolean(probe.ok)
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && probe.calls?.createTexture === 2
          && probe.calls?.browserTextureUpdate === 2
          && probe.calls?.browserTextureBind === 2
          && probe.calls?.setTexture === 2
          && probe.calls?.setTextureStageState === 18
          && probe.calls?.drawIndexed === 1
          && browserProbe?.renderState?.textureStages?.[0]?.colorOp === D3DTOP_SELECTARG1
          && browserProbe?.renderState?.textureStages?.[0]?.colorArg1 === D3DTA_TEXTURE
          && browserProbe?.renderState?.textureStages?.[0]?.texCoordIndex === 0
          && browserProbe?.renderState?.textureStages?.[1]?.colorOp === D3DTOP_SELECTARG1
          && browserProbe?.renderState?.textureStages?.[1]?.colorArg1 === D3DTA_TEXTURE
          && browserProbe?.renderState?.textureStages?.[1]?.texCoordIndex === 1
          && browserProbe?.texture0?.id === probe.textures?.stage0?.id
          && browserProbe?.texture0?.ready === true
          && browserProbe?.texture0?.sampled === true
          && browserProbe?.texture0?.texCoordSet === 0
          && browserProbe?.texture0?.texCoordOffset === D3D8_XYZNDUV_TEXCOORD0_OFFSET
          && browserProbe?.texture0?.sampler?.gl?.minFilter === gl.NEAREST
          && browserProbe?.texture0?.sampler?.gl?.magFilter === gl.NEAREST
          && browserProbe?.texture1?.id === probe.textures?.stage1?.id
          && browserProbe?.texture1?.ready === true
          && browserProbe?.texture1?.sampled === true
          && browserProbe?.texture1?.texCoordSet === 1
          && browserProbe?.texture1?.texCoordOffset ===
            D3D8_XYZNDUV_TEXCOORD0_OFFSET + D3D8_XYZNDUV_TEXCOORD_STRIDE
          && browserProbe?.texture1?.combiner?.colorOp === D3DTOP_SELECTARG1
          && browserProbe?.texture1?.combiner?.colorArg1 === D3DTA_TEXTURE
          && browserProbe?.texture1?.combiner?.supported === true
          && browserProbe?.stage1Combiner?.textureAvailable === true
          && browserProbe?.stage1Combiner?.supported === true
          && browserProbe?.texture1?.sampler?.gl?.minFilter === gl.NEAREST
          && browserProbe?.texture1?.sampler?.gl?.magFilter === gl.NEAREST
          && browserProbe?.boundTextures?.["0"] === probe.textures?.stage0?.id
          && browserProbe?.boundTextures?.["1"] === probe.textures?.stage1?.id
          && centerPixelOk
          && textureDelta.creates === 2
          && textureDelta.updates === 2
          && textureDelta.binds === 2
          && textureDelta.releaseUnbinds === 2
          && textureDelta.releases === 2
          && textureDelta.samplerApplications === 2
          && textureProbe?.live === 0
          && Object.keys(textureProbe?.boundTextures ?? {}).length === 0;
        return {
          ok,
          command,
          probe,
          browserProbe,
          textureProbe,
          textureDelta,
          centerPixelOk,
          state: snapshotState(),
        };
      }
    case "d3d8TextureMipChainDraw":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 texture mip-chain probe cannot run" };
        }
        const cases = [];
        for (const caseId of [0, 1, 2, 3]) {
          const beforeTextures = harnessState.graphics.d3d8Textures ?? {};
          const probe = parseModuleState(wasmModule.probeD3D8TextureMipChainDraw(caseId));
          const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
          const textureProbe = harnessState.graphics.d3d8Textures ?? null;
          const textureDelta = {
            creates: (textureProbe?.creates ?? 0) - (beforeTextures.creates ?? 0),
            updates: (textureProbe?.updates ?? 0) - (beforeTextures.updates ?? 0),
            binds: (textureProbe?.binds ?? 0) - (beforeTextures.binds ?? 0),
            releaseUnbinds: (textureProbe?.releaseUnbinds ?? 0) - (beforeTextures.releaseUnbinds ?? 0),
            releases: (textureProbe?.releases ?? 0) - (beforeTextures.releases ?? 0),
            samplerApplications: (textureProbe?.samplerApplications ?? 0) -
              (beforeTextures.samplerApplications ?? 0),
          };
          const expectedCenter = Array.isArray(probe.expectedCenter)
            ? probe.expectedCenter
            : [0, 0, 0, 255];
          const expectedUploads = Number(probe.texture?.uploadedLevels ?? 0) >>> 0;
          const expectedComplete = Boolean(probe.texture?.completeMipChain);
          const expectedMipFilter = Number(probe.texture?.mipFilter ?? 0) >>> 0;
          const expectedRequestedMipmaps = expectedMipFilter !== D3DTEXF_NONE;
          const expectedUsedMipmaps = expectedComplete && expectedRequestedMipmaps;
          const expectedGlMin = expectedUsedMipmaps ? gl.NEAREST_MIPMAP_NEAREST : gl.NEAREST;
          const expectedFallback = expectedRequestedMipmaps && !expectedComplete
            ? "incomplete mip chain"
            : null;
          const expectedMaxMipLevel = Number(probe.texture?.maxMipLevel ?? 0) >>> 0;
          const expectedBaseLevel = expectedComplete ? Math.min(expectedMaxMipLevel, 2) : 0;
          const expectedMaxLevel = expectedComplete ? 2 : 0;
          const expectedLodBias = Number(probe.texture?.mipMapLodBias ?? 0);
          const sampler = browserProbe?.texture0?.sampler ?? {};
          const centerPixelOk = browserProbe?.centerPixel
            && pixelsApproximatelyEqual(browserProbe.centerPixel, expectedCenter, 8);
          const caseOk = Boolean(probe.ok)
            && probe.source === "browser_d3d8_texture_mip_chain_draw_probe"
            && probe.calls?.createTexture === 1
            && probe.calls?.textureLockRect === expectedUploads
            && probe.calls?.textureUnlockRect === expectedUploads
            && probe.calls?.browserTextureUpdate === expectedUploads
            && probe.calls?.browserTextureBind === 1
            && probe.calls?.browserTextureRelease === 1
            && probe.calls?.setTextureStageState === 16
            && browserProbe?.source === "browser_d3d8_draw_indexed"
            && browserProbe?.ok === true
            && browserProbe?.texture0?.id === probe.texture?.id
            && browserProbe?.texture0?.format === D3DFMT_A8R8G8B8
            && browserProbe?.texture0?.sampled === true
            && browserProbe?.texture0?.levels === 3
            && browserProbe?.texture0?.uploads === expectedUploads
            && browserProbe?.texture0?.initializedLevels?.join(",") ===
              probe.texture?.initializedLevels?.join(",")
            && browserProbe?.texture0?.completeMipChain === expectedComplete
            && sampler.d3d?.minFilter === D3DTEXF_POINT
            && sampler.d3d?.magFilter === D3DTEXF_POINT
            && sampler.d3d?.mipFilter === expectedMipFilter
            && sampler.d3d?.maxMipLevel === expectedMaxMipLevel
            && sampler.d3d?.mipMapLodBiasBits === (Number(probe.texture?.mipMapLodBiasBits ?? 0) >>> 0)
            && Math.abs((sampler.d3d?.mipMapLodBias ?? 0) - expectedLodBias) < 0.001
            && sampler.completeMipChain === expectedComplete
            && sampler.requestedMipmaps === expectedRequestedMipmaps
            && sampler.usedMipmaps === expectedUsedMipmaps
            && sampler.fallbackReason === expectedFallback
            && sampler.gl?.minFilter === expectedGlMin
            && sampler.gl?.baseLevel === expectedBaseLevel
            && sampler.gl?.maxLevel === expectedMaxLevel
            && Math.abs((sampler.gl?.lodBias ?? 0) - expectedLodBias) < 0.001
            && sampler.gl?.lodBiasSource === "shader"
            && browserProbe?.texture0?.combiner?.opName === "selectArg1"
            && centerPixelOk
            && textureDelta.creates === 1
            && textureDelta.updates === expectedUploads
            && textureDelta.binds === 1
            && textureDelta.releaseUnbinds === 1
            && textureDelta.releases === 1
            && textureDelta.samplerApplications === 1
            && textureProbe?.live === 0;
          cases.push({
            ok: caseOk,
            probe,
            browserProbe,
            textureProbe,
            textureDelta,
            centerPixelOk,
          });
        }
        return {
          ok: cases.every((entry) => entry.ok),
          command,
          cases,
          state: snapshotState(),
        };
      }
    case "d3d8TextureCombiner":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 texture combiner probe cannot run" };
        }
        const cases = [];
        for (let caseId = 0; caseId < 35; ++caseId) {
          const beforeTextures = harnessState.graphics.d3d8Textures ?? {};
          const probe = parseModuleState(wasmModule.probeD3D8TextureCombiner(caseId));
          const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
          const textureProbe = harnessState.graphics.d3d8Textures ?? null;
          const textureDelta = {
            creates: (textureProbe?.creates ?? 0) - (beforeTextures.creates ?? 0),
            updates: (textureProbe?.updates ?? 0) - (beforeTextures.updates ?? 0),
            binds: (textureProbe?.binds ?? 0) - (beforeTextures.binds ?? 0),
            releaseUnbinds: (textureProbe?.releaseUnbinds ?? 0) - (beforeTextures.releaseUnbinds ?? 0),
            releases: (textureProbe?.releases ?? 0) - (beforeTextures.releases ?? 0),
          };
          const expectedCenter = probe.expectedCenter ?? [];
          const centerPixelOk = Array.isArray(browserProbe?.centerPixel)
            && expectedCenter.length === 4
            && pixelsApproximatelyEqual(browserProbe.centerPixel, expectedCenter, 2);
          const combiner = browserProbe?.texture0?.combiner ?? {};
          const stage1Combiner = browserProbe?.stage1Combiner ?? {};
          const expectedStageStateCalls = Number(probe.expectedStageStateCalls ?? 14);
          const caseOk = Boolean(probe.ok)
            && browserProbe?.source === "browser_d3d8_draw_indexed"
            && browserProbe?.usedPersistentBuffers === true
            && browserProbe?.texture0?.sampled === true
            && browserProbe?.texture0?.id === probe.texture?.id
            && browserProbe?.texture0?.sampler?.gl?.minFilter === gl.NEAREST
            && browserProbe?.texture0?.sampler?.gl?.magFilter === gl.NEAREST
            && combiner.colorOp === probe.combiner?.colorOp
            && combiner.colorArg0 === probe.combiner?.colorArg0
            && combiner.colorArg1 === probe.combiner?.colorArg1
            && combiner.colorArg2 === probe.combiner?.colorArg2
            && combiner.resultArg === probe.combiner?.resultArg
            && combiner.alphaOp === probe.combiner?.alphaOp
            && combiner.alphaArg0 === probe.combiner?.alphaArg0
            && combiner.alphaArg1 === probe.combiner?.alphaArg1
            && combiner.alphaArg2 === probe.combiner?.alphaArg2
            && stage1Combiner.colorOp === probe.stage1Combiner?.colorOp
            && stage1Combiner.colorArg1 === probe.stage1Combiner?.colorArg1
            && stage1Combiner.colorArg2 === probe.stage1Combiner?.colorArg2
            && browserProbe?.renderState?.textureFactor === probe.textureFactor
            && browserProbe?.textureFactor === probe.textureFactor
            && combiner.supported === true
            && stage1Combiner.supported === true
            && Number(probe.calls?.setTextureStageState ?? 0) === expectedStageStateCalls
            && centerPixelOk
            && textureDelta.creates === 1
            && textureDelta.updates === 1
            && textureDelta.binds === 1
            && textureDelta.releaseUnbinds === 1
            && textureDelta.releases === 1
            && textureProbe?.live === 0;
          cases.push({
            ok: caseOk,
            probe,
            browserProbe,
            textureDelta,
            centerPixelOk,
          });
        }
        return {
          ok: cases.every((entry) => entry.ok),
          command,
          cases,
          state: snapshotState(),
        };
      }
    case "d3d8TexCoordIndex":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 texcoord index probe cannot run" };
        }
        const cases = [];
        for (let caseId = 0; caseId < 2; ++caseId) {
          const beforeTextures = harnessState.graphics.d3d8Textures ?? {};
          const probe = parseModuleState(wasmModule.probeD3D8TexCoordIndex(caseId));
          const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
          const textureProbe = harnessState.graphics.d3d8Textures ?? null;
          const textureDelta = {
            creates: (textureProbe?.creates ?? 0) - (beforeTextures.creates ?? 0),
            updates: (textureProbe?.updates ?? 0) - (beforeTextures.updates ?? 0),
            binds: (textureProbe?.binds ?? 0) - (beforeTextures.binds ?? 0),
            releaseUnbinds: (textureProbe?.releaseUnbinds ?? 0) - (beforeTextures.releaseUnbinds ?? 0),
            releases: (textureProbe?.releases ?? 0) - (beforeTextures.releases ?? 0),
          };
          const expectedCenter = probe.expectedCenter ?? [];
          const centerPixelOk = Array.isArray(browserProbe?.centerPixel)
            && expectedCenter.length === 4
            && pixelsApproximatelyEqual(browserProbe.centerPixel, expectedCenter, 2);
          const texture0 = browserProbe?.texture0 ?? {};
          const caseOk = Boolean(probe.ok)
            && browserProbe?.source === "browser_d3d8_draw_indexed"
            && browserProbe?.usedPersistentBuffers === true
            && browserProbe?.texture0?.sampled === true
            && texture0.id === probe.texture?.id
            && texture0.texCoordIndex === probe.texcoord?.index
            && texture0.texCoordModeName === "passthru"
            && texture0.texCoordSet === probe.texcoord?.set
            && texture0.texCoordOffset === probe.texcoord?.expectedOffset
            && texture0.textureTransformFlags === probe.texcoord?.textureTransformFlags
            && texture0.texCoordSupported === true
            && centerPixelOk
            && textureDelta.creates === 1
            && textureDelta.updates === 1
            && textureDelta.binds === 1
            && textureDelta.releaseUnbinds === 1
            && textureDelta.releases === 1
            && textureProbe?.live === 0;
          cases.push({
            ok: caseOk,
            probe,
            browserProbe,
            textureDelta,
            centerPixelOk,
          });
        }
        return {
          ok: cases.every((entry) => entry.ok),
          command,
          cases,
          state: snapshotState(),
        };
      }
    case "d3d8TextureTransform":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 texture transform probe cannot run" };
        }
        const cases = [];
        for (let caseId = 0; caseId < 2; ++caseId) {
          const beforeTextures = harnessState.graphics.d3d8Textures ?? {};
          const probe = parseModuleState(wasmModule.probeD3D8TextureTransform(caseId));
          const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
          const textureProbe = harnessState.graphics.d3d8Textures ?? null;
          const textureDelta = {
            creates: (textureProbe?.creates ?? 0) - (beforeTextures.creates ?? 0),
            updates: (textureProbe?.updates ?? 0) - (beforeTextures.updates ?? 0),
            binds: (textureProbe?.binds ?? 0) - (beforeTextures.binds ?? 0),
            releaseUnbinds: (textureProbe?.releaseUnbinds ?? 0) - (beforeTextures.releaseUnbinds ?? 0),
            releases: (textureProbe?.releases ?? 0) - (beforeTextures.releases ?? 0),
          };
          const expectedCenter = probe.expectedCenter ?? [];
          const centerPixelOk = Array.isArray(browserProbe?.centerPixel)
            && expectedCenter.length === 4
            && pixelsApproximatelyEqual(browserProbe.centerPixel, expectedCenter, 2);
          const texture0 = browserProbe?.texture0 ?? {};
          const expectedApplied = Boolean(probe.transform?.applied);
          const caseOk = Boolean(probe.ok)
            && browserProbe?.source === "browser_d3d8_draw_indexed"
            && browserProbe?.usedPersistentBuffers === true
            && texture0.sampled === true
            && texture0.id === probe.texture?.id
            && texture0.texCoordIndex === probe.texcoord?.index
            && texture0.texCoordModeName === "passthru"
            && texture0.texCoordSet === probe.texcoord?.set
            && texture0.texCoordOffset === probe.texcoord?.expectedOffset
            && texture0.textureTransformFlags === probe.texcoord?.textureTransformFlags
            && texture0.textureTransformModeName === probe.transform?.modeName
            && texture0.textureTransformSupported === true
            && texture0.textureTransformApplied === expectedApplied
            && texture0.texCoordSupported === true
            && centerPixelOk
            && textureDelta.creates === 1
            && textureDelta.updates === 1
            && textureDelta.binds === 1
            && textureDelta.releaseUnbinds === 1
            && textureDelta.releases === 1
            && textureProbe?.live === 0;
          cases.push({
            ok: caseOk,
            probe,
            browserProbe,
            textureDelta,
            centerPixelOk,
          });
        }
        return {
          ok: cases.every((entry) => entry.ok),
          command,
          cases,
          state: snapshotState(),
        };
      }
    case "d3d8LegacyTextureUpload":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 legacy texture upload probe cannot run" };
        }
        const before = harnessState.graphics.d3d8Textures ?? {};
        const probe = parseModuleState(wasmModule.probeD3D8LegacyTextureUpload());
        const textureProbe = harnessState.graphics.d3d8Textures ?? null;
        const delta = {
          creates: (textureProbe?.creates ?? 0) - (before.creates ?? 0),
          updates: (textureProbe?.updates ?? 0) - (before.updates ?? 0),
          releases: (textureProbe?.releases ?? 0) - (before.releases ?? 0),
        };
        const probeFormats = Array.isArray(probe.formats) ? probe.formats : [];
        const legacyUploads = Array.isArray(textureProbe?.legacyUploads)
          ? textureProbe.legacyUploads.slice(-probeFormats.length)
          : [];
        const legacyByName = new Map(
          legacyUploads.map((entry) => {
            const name = entry.storage === "rg8-luminance-alpha" ? "A8L8"
              : entry.storage === "r8-luminance" ? "L8"
              : entry.storage === "r8-alpha" ? "A8"
              : null;
            return name ? [name, entry] : null;
          }).filter(Boolean),
        );
        const perFormat = probeFormats.map((entry) => {
          const browser = legacyByName.get(entry.name) ?? null;
          const expectedSwizzle = entry.name === "A8L8"
            ? { r: gl.RED, g: gl.RED, b: gl.RED, a: GL_GREEN, semantic: "luminanceAlpha" }
            : entry.name === "L8"
              ? { r: gl.RED, g: gl.RED, b: gl.RED, a: gl.ONE, semantic: "luminance" }
              : entry.name === "A8"
                ? { r: gl.ZERO, g: gl.ZERO, b: gl.ZERO, a: gl.RED, semantic: "alpha" }
                : null;
          const swizzle = browser?.swizzle ?? {};
          const swizzleOk = expectedSwizzle !== null
            && swizzle.r === expectedSwizzle.r
            && swizzle.g === expectedSwizzle.g
            && swizzle.b === expectedSwizzle.b
            && swizzle.a === expectedSwizzle.a
            && swizzle.semantic === expectedSwizzle.semantic;
          const samplePixelOk = Array.isArray(browser?.samplePixel)
            && browser.samplePixel.join(",") === (entry.expectedSampleRgba ?? []).join(",");
          const legacySampleOk = Array.isArray(browser?.legacySamplePixel)
            && browser.legacySamplePixel.slice(0, entry.expectedLegacySampleLen ?? 0).join(",")
              === (entry.expectedLegacySample ?? []).slice(0, entry.expectedLegacySampleLen ?? 0).join(",");
          return {
            name: entry.name,
            d3dFormat: entry.d3dFormat,
            pitch: entry.pitch,
            rowBytes: entry.rowBytes,
            bytesPerPixel: entry.bytesPerPixel,
            nativeOk: entry.create === 0
              && entry.lock === 0
              && entry.unlock === 0
              && entry.pitch === 2 * entry.bytesPerPixel
              && entry.rowBytes === 2 * entry.bytesPerPixel,
            browser,
            expectedSampleRgba: entry.expectedSampleRgba,
            expectedLegacySample: entry.expectedLegacySample,
            swizzleOk,
            samplePixelOk,
            legacySampleOk,
          };
        });
        const ok = Boolean(probe.ok)
          && probe.calls?.createTexture === 3
          && probe.calls?.textureLockRect === 3
          && probe.calls?.textureUnlockRect === 3
          && probe.calls?.browserTextureCreate === 3
          && probe.calls?.browserTextureUpdate === 3
          && probe.calls?.browserTextureRelease === 3
          && delta.creates === 3
          && delta.updates === 3
          && delta.releases === 3
          && textureProbe?.live === 0
          && perFormat.length === 3
          && perFormat.every((entry) => entry.nativeOk && entry.swizzleOk
            && entry.samplePixelOk && entry.legacySampleOk);
        return {
          ok,
          command,
          probe,
          browserProbe: textureProbe,
          browserDelta: delta,
          perFormat,
          state: snapshotState(),
        };
      }
    case "d3d8LegacyTextureDraw":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 legacy texture draw probe cannot run" };
        }
        const cases = [];
        for (const caseId of [0, 1, 2]) {
          clearCanvas({ rgba: [0, 0, 0, 255] });
          harnessState.graphics = {
            ...harnessState.graphics,
            lastD3D8DrawIndexed: null,
          };
          const before = harnessState.graphics.d3d8Textures ?? {};
          const probe = parseModuleState(wasmModule.probeD3D8LegacyTextureDraw(caseId));
          const textureProbe = harnessState.graphics.d3d8Textures ?? null;
          const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
          const textureDelta = {
            creates: (textureProbe?.creates ?? 0) - (before.creates ?? 0),
            updates: (textureProbe?.updates ?? 0) - (before.updates ?? 0),
            binds: (textureProbe?.binds ?? 0) - (before.binds ?? 0),
            releaseUnbinds: (textureProbe?.releaseUnbinds ?? 0) - (before.releaseUnbinds ?? 0),
            releases: (textureProbe?.releases ?? 0) - (before.releases ?? 0),
            samplerApplications: (textureProbe?.samplerApplications ?? 0) - (before.samplerApplications ?? 0),
          };
          const expectedCenter = Array.isArray(probe.expectedCenter)
            ? probe.expectedCenter
            : [0, 0, 0, 255];
          const centerPixelOk = browserProbe?.centerPixel
            && pixelsApproximatelyEqual(browserProbe.centerPixel, expectedCenter, 2);
          const legacyUpload = Array.isArray(textureProbe?.legacyUploads)
            ? textureProbe.legacyUploads[textureProbe.legacyUploads.length - 1] ?? null
            : null;
          const expectedSwizzle = probe.texture?.semantic === "luminanceAlpha"
            ? { r: gl.RED, g: gl.RED, b: gl.RED, a: GL_GREEN, semantic: "luminanceAlpha" }
            : probe.texture?.semantic === "luminance"
              ? { r: gl.RED, g: gl.RED, b: gl.RED, a: gl.ONE, semantic: "luminance" }
              : probe.texture?.semantic === "alpha"
                ? { r: gl.ZERO, g: gl.ZERO, b: gl.ZERO, a: gl.RED, semantic: "alpha" }
                : null;
          const swizzle = legacyUpload?.swizzle ?? {};
          const swizzleOk = expectedSwizzle !== null
            && swizzle.r === expectedSwizzle.r
            && swizzle.g === expectedSwizzle.g
            && swizzle.b === expectedSwizzle.b
            && swizzle.a === expectedSwizzle.a
            && swizzle.semantic === expectedSwizzle.semantic;
          const texelBytes = Array.isArray(probe.texture?.texelBytes) ? probe.texture.texelBytes : [];
          const expectedRawSample = [
            Number(texelBytes[0] ?? 0) >>> 0,
            (Number(probe.texture?.bytesPerPixel ?? 0) >>> 0) > 1
              ? Number(texelBytes[1] ?? 0) >>> 0
              : 0,
            0,
            255,
          ];
          const rawSampleOk = Array.isArray(legacyUpload?.samplePixel)
            && legacyUpload.samplePixel.join(",") === expectedRawSample.join(",");
          const caseOk = Boolean(probe.ok)
            && probe.source === "browser_d3d8_legacy_texture_draw_probe"
            && probe.calls?.createTexture === 1
            && probe.calls?.textureLockRect === 1
            && probe.calls?.textureUnlockRect === 1
            && probe.calls?.browserTextureUpdate === 1
            && probe.calls?.browserTextureBind === 1
            && probe.calls?.browserTextureRelease === 1
            && probe.calls?.setTextureStageState === 14
            && browserProbe?.source === "browser_d3d8_draw_indexed"
            && browserProbe?.ok === true
            && browserProbe?.texture0?.id === probe.texture?.id
            && browserProbe?.texture0?.format === probe.texture?.format
            && browserProbe?.texture0?.sampled === true
            && browserProbe?.texture0?.combiner?.supported === true
            && browserProbe?.texture0?.sampler?.supported === true
            && centerPixelOk
            && legacyUpload?.format === probe.texture?.format
            && legacyUpload?.semantic === probe.texture?.semantic
            && swizzleOk
            && rawSampleOk
            && textureDelta.creates === 1
            && textureDelta.updates === 1
            && textureDelta.binds === 1
            && textureDelta.releaseUnbinds === 1
            && textureDelta.releases === 1
            && textureDelta.samplerApplications === 1
            && textureProbe?.live === 0;
          cases.push({
            ok: caseOk,
            probe,
            browserProbe,
            textureDelta,
            legacyUpload,
            expectedRawSample,
            centerPixelOk,
            swizzleOk,
            rawSampleOk,
          });
        }
        return {
          ok: cases.every((entry) => entry.ok),
          command,
          cases,
          state: snapshotState(),
        };
      }
    case "d3d8DxtTextureDraw":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 DXT texture draw probe cannot run" };
        }
        const cases = [];
        for (const caseId of [0, 1, 2]) {
          clearCanvas({ rgba: [0, 0, 0, 255] });
          harnessState.graphics = {
            ...harnessState.graphics,
            lastD3D8DrawIndexed: null,
          };
          const before = harnessState.graphics.d3d8Textures ?? {};
          const probe = parseModuleState(wasmModule.probeD3D8DxtTextureDraw(caseId));
          const textureProbe = harnessState.graphics.d3d8Textures ?? null;
          const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
          const textureDelta = {
            creates: (textureProbe?.creates ?? 0) - (before.creates ?? 0),
            updates: (textureProbe?.updates ?? 0) - (before.updates ?? 0),
            binds: (textureProbe?.binds ?? 0) - (before.binds ?? 0),
            releaseUnbinds: (textureProbe?.releaseUnbinds ?? 0) - (before.releaseUnbinds ?? 0),
            releases: (textureProbe?.releases ?? 0) - (before.releases ?? 0),
            unsupportedUpdates: (textureProbe?.unsupportedUpdates ?? 0) - (before.unsupportedUpdates ?? 0),
            samplerApplications: (textureProbe?.samplerApplications ?? 0) - (before.samplerApplications ?? 0),
          };
          const expectedCenter = Array.isArray(probe.expectedCenter)
            ? probe.expectedCenter
            : [0, 0, 0, 255];
          const centerPixelOk = browserProbe?.centerPixel
            && pixelsApproximatelyEqual(browserProbe.centerPixel, expectedCenter, 2);
          const lastUpdate = textureProbe?.lastUpdate ?? null;
          const caseOk = Boolean(probe.ok)
            && probe.source === "browser_d3d8_dxt_texture_draw_probe"
            && probe.calls?.createTexture === 1
            && probe.calls?.textureLockRect === 2
            && probe.calls?.textureUnlockRect === 1
            && probe.results?.partialLock !== 0
            && probe.calls?.browserTextureUpdate === 1
            && probe.calls?.browserTextureBind === 1
            && probe.calls?.browserTextureRelease === 1
            && probe.calls?.setTextureStageState === 14
            && lastUpdate?.compressed === true
            && lastUpdate?.blockBytes === probe.texture?.blockBytes
            && lastUpdate?.byteSize === probe.texture?.byteSize
            && lastUpdate?.convertedByteSize === probe.texture?.byteSize
            && browserProbe?.source === "browser_d3d8_draw_indexed"
            && browserProbe?.ok === true
            && browserProbe?.texture0?.id === probe.texture?.id
            && browserProbe?.texture0?.format === probe.texture?.format
            && browserProbe?.texture0?.sampled === true
            && browserProbe?.texture0?.combiner?.supported === true
            && browserProbe?.texture0?.sampler?.supported === true
            && centerPixelOk
            && textureDelta.creates === 1
            && textureDelta.updates === 1
            && textureDelta.binds === 1
            && textureDelta.releaseUnbinds === 1
            && textureDelta.releases === 1
            && textureDelta.unsupportedUpdates === 0
            && textureDelta.samplerApplications === 1
            && textureProbe?.live === 0;
          cases.push({
            ok: caseOk,
            probe,
            browserProbe,
            textureDelta,
            lastUpdate,
            centerPixelOk,
          });
        }
        return {
          ok: cases.every((entry) => entry.ok),
          command,
          cases,
          s3tc: Boolean(s3tc),
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
    case "ww3dRender2DTexturedQuad":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; WW3D Render2D cannot render" };
        }
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          lastD3D8DrawIndexed: null,
        };
        const textureBefore = harnessState.graphics.d3d8Textures ?? {};
        const probe = parseModuleState(wasmModule.probeWW3DRender2DTexturedQuad());
        const textureAfter = harnessState.graphics.d3d8Textures ?? null;
        const screenshot = snapshotCanvas();
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const textureDelta = {
          creates: (textureAfter?.creates ?? 0) - (textureBefore.creates ?? 0),
          updates: (textureAfter?.updates ?? 0) - (textureBefore.updates ?? 0),
          binds: (textureAfter?.binds ?? 0) - (textureBefore.binds ?? 0),
          releaseUnbinds: (textureAfter?.releaseUnbinds ?? 0) - (textureBefore.releaseUnbinds ?? 0),
          releases: (textureAfter?.releases ?? 0) - (textureBefore.releases ?? 0),
          samplerApplications: (textureAfter?.samplerApplications ?? 0) -
            (textureBefore.samplerApplications ?? 0),
        };
        const ok = Boolean(probe.ok)
          && Boolean(browserProbe?.ok)
          && browserProbe?.texture0?.sampled === true
          && browserProbe?.texture0?.id === probe?.texture?.id
          && pixelLooksRed(browserProbe.centerPixel)
          && pixelLooksRed(screenshot.centerPixel);
        return {
          ok,
          command,
          probe,
          browserProbe,
          textureDelta,
          textureProbe: textureAfter,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dRender2DSentence":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; WW3D Render2DSentence cannot render" };
        }
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          lastD3D8DrawIndexed: null,
        };
        const textureBefore = harnessState.graphics.d3d8Textures ?? {};
        const probe = parseModuleState(wasmModule.probeWW3DRender2DSentence());
        const textureAfter = harnessState.graphics.d3d8Textures ?? null;
        const screenshot = snapshotCanvas();
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const virtualDrawRect = probe?.extents?.draw ?? {};
        const scaleX = screenshot.width / 800;
        const scaleY = screenshot.height / 600;
        const drawRect = {
          left: (virtualDrawRect.left ?? 0) * scaleX,
          top: (virtualDrawRect.top ?? 0) * scaleY,
          right: (virtualDrawRect.right ?? 0) * scaleX,
          bottom: (virtualDrawRect.bottom ?? 0) * scaleY,
        };
        const textRegion = sampleCanvasRegion(drawRect, 8);
        const textureDelta = {
          creates: (textureAfter?.creates ?? 0) - (textureBefore.creates ?? 0),
          updates: (textureAfter?.updates ?? 0) - (textureBefore.updates ?? 0),
          binds: (textureAfter?.binds ?? 0) - (textureBefore.binds ?? 0),
          releaseUnbinds: (textureAfter?.releaseUnbinds ?? 0) - (textureBefore.releaseUnbinds ?? 0),
          releases: (textureAfter?.releases ?? 0) - (textureBefore.releases ?? 0),
          samplerApplications: (textureAfter?.samplerApplications ?? 0) -
            (textureBefore.samplerApplications ?? 0),
        };
        const ok = Boolean(probe.ok)
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && browserProbe?.usedTransforms === true
          && browserProbe?.usedIdentityClipSpace === true
          && browserProbe?.texture0?.sampled === true
          && browserProbe?.texture0?.id === probe?.copyRects?.uploadedTextureId
          && browserProbe?.texture0?.format === D3DFMT_A4R4G4B4
          && (textRegion.coloredPixelCount ?? 0) > 16
          && (textRegion.maxComponent ?? 0) > 32;
        return {
          ok,
          command,
          probe,
          browserProbe,
          textRegion,
          textureDelta,
          textureProbe: textureAfter,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dDisplayString":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; WW3DDisplayString cannot render" };
        }
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          lastD3D8DrawIndexed: null,
        };
        const textureBefore = harnessState.graphics.d3d8Textures ?? {};
        const probe = parseModuleState(wasmModule.probeWW3DDisplayString());
        const textureAfter = harnessState.graphics.d3d8Textures ?? null;
        const screenshot = snapshotCanvas();
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const virtualDrawRect = probe?.drawRegion ?? {};
        const scaleX = screenshot.width / 800;
        const scaleY = screenshot.height / 600;
        const drawRect = {
          left: (virtualDrawRect.left ?? 0) * scaleX,
          top: (virtualDrawRect.top ?? 0) * scaleY,
          right: (virtualDrawRect.right ?? 0) * scaleX,
          bottom: (virtualDrawRect.bottom ?? 0) * scaleY,
        };
        const textRegion = sampleCanvasRegion(drawRect, 8);
        const textureDelta = {
          creates: (textureAfter?.creates ?? 0) - (textureBefore.creates ?? 0),
          updates: (textureAfter?.updates ?? 0) - (textureBefore.updates ?? 0),
          binds: (textureAfter?.binds ?? 0) - (textureBefore.binds ?? 0),
          releaseUnbinds: (textureAfter?.releaseUnbinds ?? 0) - (textureBefore.releaseUnbinds ?? 0),
          releases: (textureAfter?.releases ?? 0) - (textureBefore.releases ?? 0),
          samplerApplications: (textureAfter?.samplerApplications ?? 0) -
            (textureBefore.samplerApplications ?? 0),
        };
        const ok = Boolean(probe.ok)
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && browserProbe?.usedTransforms === true
          && browserProbe?.usedIdentityClipSpace === true
          && browserProbe?.texture0?.sampled === true
          && browserProbe?.texture0?.id === probe?.copyRects?.uploadedTextureId
          && browserProbe?.texture0?.format === D3DFMT_A4R4G4B4
          && (textRegion.coloredPixelCount ?? 0) > 16
          && (textRegion.maxComponent ?? 0) > 32;
        return {
          ok,
          command,
          probe,
          browserProbe,
          textRegion,
          textureDelta,
          textureProbe: textureAfter,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dDisplayDrawImage":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; WW3DDisplay drawImage cannot render" };
        }
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          lastD3D8DrawIndexed: null,
        };
        const textureBefore = harnessState.graphics.d3d8Textures ?? {};
        const probe = parseModuleState(wasmModule.probeWW3DDisplayDrawImage());
        const textureAfter = harnessState.graphics.d3d8Textures ?? null;
        const screenshot = snapshotCanvas();
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const textureDelta = {
          creates: (textureAfter?.creates ?? 0) - (textureBefore.creates ?? 0),
          updates: (textureAfter?.updates ?? 0) - (textureBefore.updates ?? 0),
          binds: (textureAfter?.binds ?? 0) - (textureBefore.binds ?? 0),
          releaseUnbinds: (textureAfter?.releaseUnbinds ?? 0) - (textureBefore.releaseUnbinds ?? 0),
          releases: (textureAfter?.releases ?? 0) - (textureBefore.releases ?? 0),
          samplerApplications: (textureAfter?.samplerApplications ?? 0) -
            (textureBefore.samplerApplications ?? 0),
        };
        const ok = Boolean(probe.ok)
          && Boolean(browserProbe?.ok)
          && browserProbe?.texture0?.sampled === true
          && browserProbe?.texture0?.id === probe?.texture?.id
          && probe?.image?.rawTexture === true
          && pixelLooksRed(browserProbe.centerPixel)
          && pixelLooksRed(screenshot.centerPixel);
        return {
          ok,
          command,
          probe,
          browserProbe,
          textureDelta,
          textureProbe: textureAfter,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dTexturedMesh":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; WW3D mesh cannot render" };
        }
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          lastD3D8DrawIndexed: null,
        };
        const textureBefore = harnessState.graphics.d3d8Textures ?? {};
        const probe = parseModuleState(wasmModule.probeWW3DTexturedMesh());
        const textureAfter = harnessState.graphics.d3d8Textures ?? null;
        const screenshot = snapshotCanvas();
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const textureDelta = {
          creates: (textureAfter?.creates ?? 0) - (textureBefore.creates ?? 0),
          updates: (textureAfter?.updates ?? 0) - (textureBefore.updates ?? 0),
          binds: (textureAfter?.binds ?? 0) - (textureBefore.binds ?? 0),
          releaseUnbinds: (textureAfter?.releaseUnbinds ?? 0) - (textureBefore.releaseUnbinds ?? 0),
          releases: (textureAfter?.releases ?? 0) - (textureBefore.releases ?? 0),
          samplerApplications: (textureAfter?.samplerApplications ?? 0) -
            (textureBefore.samplerApplications ?? 0),
        };
        const ok = Boolean(probe.ok)
          && Boolean(browserProbe?.ok)
          && browserProbe?.texture0?.sampled === true
          && browserProbe?.texture0?.id === probe?.texture?.id
          && pixelLooksRed(browserProbe.centerPixel)
          && pixelLooksRed(screenshot.centerPixel);
        return {
          ok,
          command,
          probe,
          browserProbe,
          textureDelta,
          textureProbe: textureAfter,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dTerrainTile":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; WW3D terrain tile cannot render" };
        }
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          lastD3D8DrawIndexed: null,
        };
        const textureBefore = harnessState.graphics.d3d8Textures ?? {};
        const probe = parseModuleState(wasmModule.probeWW3DTerrainTile());
        const textureAfter = harnessState.graphics.d3d8Textures ?? null;
        const screenshot = snapshotCanvas();
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const textureDelta = {
          creates: (textureAfter?.creates ?? 0) - (textureBefore.creates ?? 0),
          updates: (textureAfter?.updates ?? 0) - (textureBefore.updates ?? 0),
          binds: (textureAfter?.binds ?? 0) - (textureBefore.binds ?? 0),
          releaseUnbinds: (textureAfter?.releaseUnbinds ?? 0) - (textureBefore.releaseUnbinds ?? 0),
          releases: (textureAfter?.releases ?? 0) - (textureBefore.releases ?? 0),
          samplerApplications: (textureAfter?.samplerApplications ?? 0) -
            (textureBefore.samplerApplications ?? 0),
        };
        const ok = Boolean(probe.ok)
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.ok === true
          && browserProbe?.usedPersistentBuffers === true
          && browserProbe?.usedTransforms === true
          && browserProbe?.vertexStride === 32
          && browserProbe?.vertexLayout?.source === "fvf"
          && browserProbe?.vertexShaderFvf === probe?.draw?.vertexShaderFvf
          && browserProbe?.vertexShaderFvf !== 0
          && (browserProbe?.vertexCount ?? 0) > 0
          && (browserProbe?.indexCount ?? 0) > 0
          && textureDelta.creates >= 1
          && textureDelta.updates >= 1
          && pixelHasColor(browserProbe?.centerPixel, 8)
          && pixelHasColor(screenshot?.centerPixel, 8);
        return {
          ok,
          command,
          probe,
          browserProbe,
          textureDelta,
          textureProbe: textureAfter,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dShippedMesh":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; shipped WW3D mesh cannot render" };
        }
        const archivePath = String(payload.archivePath ?? "/assets/runtime/W3DZH.big");
        const textureArchivePath = String(payload.textureArchivePath ?? "/assets/runtime/TexturesZH.big");
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          lastD3D8DrawIndexed: null,
        };
        const textureBefore = harnessState.graphics.d3d8Textures ?? {};
        const probe = parseModuleState(wasmModule.probeWW3DShippedMesh(
          archivePath,
          textureArchivePath,
        ));
        const textureAfter = harnessState.graphics.d3d8Textures ?? null;
        const screenshot = snapshotCanvas();
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const textureDelta = {
          creates: (textureAfter?.creates ?? 0) - (textureBefore.creates ?? 0),
          updates: (textureAfter?.updates ?? 0) - (textureBefore.updates ?? 0),
          binds: (textureAfter?.binds ?? 0) - (textureBefore.binds ?? 0),
          releaseUnbinds: (textureAfter?.releaseUnbinds ?? 0) - (textureBefore.releaseUnbinds ?? 0),
          releases: (textureAfter?.releases ?? 0) - (textureBefore.releases ?? 0),
          samplerApplications: (textureAfter?.samplerApplications ?? 0) -
            (textureBefore.samplerApplications ?? 0),
        };
        const ok = Boolean(probe.ok)
          && Boolean(browserProbe?.ok)
          && browserProbe?.texture0?.sampled === true
          && browserProbe?.texture0?.id === probe?.texture?.id
          && pixelHasColor(browserProbe.centerPixel, 16)
          && pixelHasColor(screenshot.centerPixel, 16)
          && !pixelLooksRed(browserProbe.centerPixel)
          && !pixelLooksRed(screenshot.centerPixel);
        return {
          ok,
          command,
          probe,
          browserProbe,
          textureDelta,
          textureProbe: textureAfter,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dShippedMultiTextureMesh":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; shipped WW3D multi-texture mesh cannot render" };
        }
        const archivePath = String(payload.archivePath ?? "/assets/runtime/W3DZH.big");
        const textureArchivePath = String(payload.textureArchivePath ?? "/assets/runtime/TexturesZH.big");
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          lastD3D8DrawIndexed: null,
        };
        const textureBefore = harnessState.graphics.d3d8Textures ?? {};
        const probe = parseModuleState(wasmModule.probeWW3DShippedMultiTextureMesh(
          archivePath,
          textureArchivePath,
        ));
        const textureAfter = harnessState.graphics.d3d8Textures ?? null;
        const screenshot = snapshotCanvas();
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const textureDelta = {
          creates: (textureAfter?.creates ?? 0) - (textureBefore.creates ?? 0),
          updates: (textureAfter?.updates ?? 0) - (textureBefore.updates ?? 0),
          binds: (textureAfter?.binds ?? 0) - (textureBefore.binds ?? 0),
          releaseUnbinds: (textureAfter?.releaseUnbinds ?? 0) - (textureBefore.releaseUnbinds ?? 0),
          releases: (textureAfter?.releases ?? 0) - (textureBefore.releases ?? 0),
          samplerApplications: (textureAfter?.samplerApplications ?? 0) -
            (textureBefore.samplerApplications ?? 0),
        };
        const boundTexture0 = Number(browserProbe?.boundTextures?.["0"] ?? 0) >>> 0;
        const boundTexture1 = Number(browserProbe?.boundTextures?.["1"] ?? 0) >>> 0;
        const ok = Boolean(probe.ok)
          && Boolean(browserProbe?.ok)
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && browserProbe?.usedTransforms === true
          && browserProbe?.vertexShaderFvf === probe?.draw?.vertexShaderFvf
          && browserProbe?.vertexShaderFvf !== 0
          && browserProbe?.vertexLayout?.source === "fvf"
          && browserProbe?.texture0?.ready === true
          && browserProbe?.texture0?.sampled === true
          && browserProbe?.texture0?.texCoordSet === 0
          && browserProbe?.texture0?.texCoordSupported === true
          && browserProbe?.texture0?.combiner?.textureAvailable === true
          && browserProbe?.texture0?.combiner?.supported === true
          && browserProbe?.texture1?.ready === true
          && browserProbe?.texture1?.sampled === true
          && browserProbe?.texture1?.texCoordSet === 1
          && browserProbe?.texture1?.texCoordSupported === true
          && browserProbe?.texture1?.combiner?.textureAvailable === true
          && browserProbe?.texture1?.combiner?.supported === true
          && browserProbe?.stage1Combiner?.textureAvailable === true
          && browserProbe?.stage1Combiner?.supported === true
          && boundTexture0 !== 0
          && boundTexture1 !== 0
          && boundTexture0 !== boundTexture1
          && pixelHasColor(browserProbe.centerPixel, 8)
          && pixelHasColor(screenshot.centerPixel, 8)
          && textureDelta.creates >= 2
          && textureDelta.updates >=
            ((probe?.textures?.[0]?.levels ?? 0) + (probe?.textures?.[1]?.levels ?? 0))
          && textureDelta.binds >= 2;
        return {
          ok,
          command,
          probe,
          browserProbe,
          textureDelta,
          textureProbe: textureAfter,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dSourceAssetLoad":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; WW3D source asset cannot load" };
        }
        const probe = parseModuleState(wasmModule.probeWW3DSourceAssetLoad());
        return {
          ok: Boolean(probe.ok),
          command,
          probe,
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
    case "gdiFontProbe":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; GDI font bridge cannot run" };
        }
        const pointSize = Math.max(8, Math.min(72, Number(payload.pointSize ?? 16)));
        const face = String(payload.face ?? "Arial");
        const probe = parseModuleState(wasmModule.probeGdiFont(pointSize, face));
        const ok = Boolean(probe.ok)
          && probe.rasterizerInstalled === true
          && probe.rasterized === true
          && probe.metricsReported === true
          && probe.measureReported === true
          && (probe.glyphCoverage ?? 0) > 0
          && (probe.fontHeight ?? 0) > 0;
        return { ok, command, probe, state: snapshotState() };
      }
    case "ww3dFontChars":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; WW3D FontChars cannot run" };
        }
        const pointSize = Math.max(8, Math.min(72, Number(payload.pointSize ?? 24)));
        const face = String(payload.face ?? "Arial");
        const bold = payload.bold ? 1 : 0;
        const probe = parseModuleState(wasmModule.probeWW3DFontChars(pointSize, face, bold));
        const ok = Boolean(probe.ok)
          && probe.source === "ww3d_font_chars_probe"
          && probe.assetManagerCreated === true
          && probe.fontCreated === true
          && (probe.charHeight ?? 0) > 0
          && probe.positiveWidths === probe.glyphCount
          && probe.charsWithCoverage === probe.glyphCount
          && (probe.blitCoverage ?? 0) > 0;
        return { ok, command, probe, state: snapshotState() };
      }
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
