import { resolveShaderTier } from "./shader-tier-config.mjs";

// D3D8 -> WebGL2 executor for the C&C Generals Zero Hour wasm port.
//
// Extracted verbatim from harness/bridge.js (P1b of the engine-thread work,
// see notes/p1-engine-thread.md) so the SAME executor can run in two realms:
//   - main thread (today's default path: bridge.js constructs it once with the
//     page canvas + its WebGL2 context — behavior-identical to the pre-split
//     bridge.js),
//   - a pthread worker realm with a transferred OffscreenCanvas (lane P1c),
//     where env.gl is omitted and the executor creates its own context.
//
// Realm rules for code in this file:
//   - No bare document/window/DOM access without a typeof guard (worker realm
//     has neither; OffscreenCanvas has no getBoundingClientRect/CSS box).
//   - Never cache wasm heap views across calls: SharedArrayBuffer + memory
//     growth invalidates them. All heap access goes through the env.getHeap*
//     accessors, called fresh inside each operation.
//   - globalThis.__cnc* debug helpers install into WHATEVER realm constructs
//     the executor (main today; worker in threaded mode).
//
// env contract (createD3D8Executor):
//   canvas          HTMLCanvasElement | OffscreenCanvas (required)
//   gl              existing WebGL2 context for that canvas; if undefined the
//                   executor creates one (worker path)
//   s3tc            optional WEBGL_compressed_texture_s3tc handle (re-derived
//                   from gl when omitted)
//   fallbackContext optional 2d context used when gl is null (re-derived when
//                   omitted)
//   log             (message, data) -> void   (bridge recordLog on main)
//   state           harness state sink object; the executor writes
//                   .canvas/.graphics/.engineDisplaySize fields into it
//   getHeapU8/getHeapU16/getHeapU32/getHeapF32/getHeapF64
//                   FRESH wasm heap view accessors (may return null before the
//                   module exists)
//   getModule       () -> emscripten Module (reserved; EM_JS-side caches live
//                   on the Module of the engine realm)
//   preserveDrawingBuffer  optional override for the self-created-context path
//   dom             optional { stateNode, framesNode, ... } (reserved for the
//                   worker realm; unused today — DOM access is typeof-guarded)
//
// Returns { hooks, diag }: hooks = the 20 Module.cncPortD3D8* functions;
// diag = the harness-facing diagnostics/read surface (see bottom of factory).
//
// NOTE ON INDENTATION: the factory body below intentionally keeps the original
// top-level (column-0) indentation of bridge.js so that git history, greps and
// pending patches keep matching the moved code line-for-line.

export function createD3D8Executor(env) {
  const canvas = env.canvas;
  const recordLog = env.log;
  const harnessState = env.state;
  const getHeapU32 = typeof env.getHeapU32 === "function" ? env.getHeapU32 : () => null;
  const getHeapF32 = typeof env.getHeapF32 === "function" ? env.getHeapF32 : () => null;
  // Native-pointer draw payloads read render state and constants directly
  // from the engine realm. Always acquire fresh views because memory growth
  // invalidates cached Emscripten heap views.
  void env.getHeapU8; void env.getHeapU16; void env.getHeapF64;
  void env.getModule;
  void env.dom;

  // Main path: bridge.js passes its page-lifetime context in. Worker path:
  // create a context on the (Offscreen)Canvas with the same attributes the
  // main path uses (preserveDrawingBuffer overridable via env).
  const gl = env.gl !== undefined ? env.gl : canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: true,
    stencil: true,
    preserveDrawingBuffer: env.preserveDrawingBuffer !== undefined
      ? Boolean(env.preserveDrawingBuffer)
      : true,
  });
  const s3tc = env.s3tc !== undefined
    ? env.s3tc
    : (gl ? gl.getExtension("WEBGL_compressed_texture_s3tc") : null);
  const fallbackContext = env.fallbackContext !== undefined
    ? env.fallbackContext
    : (gl ? null : canvas.getContext("2d", { alpha: false }));

const provokingVertex = gl ? gl.getExtension("WEBGL_provoking_vertex") : null;
const d3d8GpuTimerExtension = gl
  ? gl.getExtension("EXT_disjoint_timer_query_webgl2")
  : null;
const d3d8HasStencilBuffer = gl ? Boolean(gl.getContextAttributes()?.stencil) : false;
let d3d8StencilValueMaskCache = null;
let d3d8GpuFrameTimingEnabled = false;
let d3d8GpuFrameActiveQuery = null;
const d3d8GpuFramePendingQueries = [];
const d3d8GpuFrameSamplesMs = [];
let d3d8GpuFrameSampleTotalMs = 0;
let d3d8GpuFrameDisjointSamples = 0;

// WebGL context loss (Safari/iPadOS kills contexts on memory/GPU pressure or
// long-blocked main threads; every GL call afterwards silently no-ops and the
// canvas turns permanently black). Full resource restoration is not
// implemented, so surface the loss loudly instead of rendering black forever.
let webglContextLost = false;
let webglContextLossAt = null;
function showWebglContextLostBanner() {
  if (typeof document === "undefined") {
    return; // worker realm: loss is still recorded + logged, no DOM banner
  }
  let banner = document.querySelector("#webglContextLostBanner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "webglContextLostBanner";
    banner.style.cssText = [
      "position:fixed", "top:0", "left:0", "right:0", "z-index:99999",
      "background:#8b0000", "color:#fff", "font:600 15px system-ui,sans-serif",
      "padding:10px 14px", "text-align:center", "cursor:pointer",
    ].join(";");
    banner.textContent =
      "Graphics context was lost (browser reclaimed the GPU) — tap here to reload the game.";
    banner.addEventListener("click", () => globalThis.location.reload());
    document.body.appendChild(banner);
  }
}
canvas.addEventListener("webglcontextlost", (event) => {
  // preventDefault keeps a future contextrestored possible per spec; we still
  // require a reload (resources are gone), but it stops some UAs from tearing
  // the page down harder.
  event.preventDefault();
  webglContextLost = true;
  webglContextLossAt = new Date().toISOString();
  try {
    console.error("[cnc-port] WebGL context LOST at", webglContextLossAt,
      "- canvas will be black until reload");
  } catch (_error) { /* ignore */ }
  try { showWebglContextLostBanner(); } catch (_error) { /* ignore */ }
  try {
    recordLog("webgl context lost", { at: webglContextLossAt });
  } catch (_error) { /* recordLog not defined yet during early evaluation */ }
});
canvas.addEventListener("webglcontextrestored", () => {
  try {
    console.error("[cnc-port] WebGL context restored event received; resources"
      + " are not restorable in-place - reload required");
  } catch (_error) { /* ignore */ }
});

let d3d8DrawProgram = null;
let d3d8ParticleProgram = null;
let d3d8UnlitTex2Program = null;
const d3d8SimpleFFPrograms = new Map();
// Fixed-function vertex/fragment GLSL sources, stashed when the FF draw
// program is built; translated SM1 shaders link against them for mixed pairs
// (FF vertex + translated pixel, translated vertex + FF pixel cascade — the
// latter is how the shipped game drives trees: Trees.vso with the tree pixel
// shader #if 0'd out in W3DTreeBuffer::drawTrees).
let d3d8FFVertexSourceCache = null;
let d3d8FFFragmentSourceCache = null;
let d3d8UnlitTex2VertexSourceCache = null;
let d3d8LitTex1VertexSourceCache = null;
// Registered SM1 shader objects (from CreatePixelShader/CreateVertexShader in
// the wasm shim) and the linked (vertexShader, pixelShader) pair programs.
const d3d8SM1PixelShaders = new Map();
const d3d8SM1VertexShaders = new Map();
const d3d8SM1PairPrograms = new Map();
const d3d8SM1DrawAudit = new Map();
let d3d8SM1DrawAuditEnabled = false;
let d3d8SM1AuditPreviousDebugCapture;
let d3d8SM1MostRecentVertexHandle = 0;
let d3d8SM1MostRecentPixelHandle = 0;
let d3d8DepthStencilProgram = null;
let d3d8DepthStencilNoClipProgram = null;

const d3d8Buffers = new Map();
const d3d8Textures = new Map();
const d3d8BoundTextures = new Map();
// Draw-cache: skips normalize* JS object rebuilds and the point-sprite +
// texture-availability uniform blocks for repeated draw-state keys. The
// previous draw stays as the fast path; the bounded table catches non-adjacent
// repeats inside sorted draw runs.
let d3d8LastDrawKey = null;
let d3d8CachedDerived = null; // {renderState, clipPlanes, material, lights, fixedFunctionLights, directionalLights, firstDirectionalLight, vertexLayout, texture0Id, texture1Id, canSampleTexture0, canSampleTexture1, texture0Coordinates, texture1Coordinates, texture0SemanticMode, texture1SemanticMode, appliedTexture0Combiner, appliedStage1Combiner, implicitAlphaCutoutThreshold, appliedPointSprite}
const D3D8_DERIVED_DRAW_CACHE_LIMIT = 128;
const d3d8DerivedDrawCache = new Map();
let d3d8DerivedDrawCacheEntries = 0;
let d3d8DerivedDrawCacheOldest = null;
let d3d8DerivedDrawCacheNewest = null;
let d3d8LastTransformSourceWorld = null;
let d3d8LastTransformSourceView = null;
let d3d8LastTransformSourceProjection = null;
let d3d8LastTransformSourceWorldRevision = 0;
let d3d8LastTransformSourceViewRevision = 0;
let d3d8LastTransformSourceProjectionRevision = 0;
let d3d8TransformUniformGeneration = 1;
let d3d8LastPointSpriteUniformInfo = null;
let d3d8LastVertexAttribKey = null;
let d3d8LastDefaultVertexAttribKey = null;
const D3D8_VERTEX_ARRAY_CACHE_LIMIT = 4096;
const d3d8VertexArrayCache = new Map();
let d3d8VertexArrayCacheEntries = 0;
let d3d8VertexArrayCachePeakEntries = 0;
let d3d8VertexArrayCacheEvictions = 0;
let d3d8VertexArrayCacheInvalidations = 0;
let d3d8VertexArrayCacheInvalidatedEntries = 0;
let d3d8VertexArrayCacheOldest = null;
let d3d8VertexArrayCacheNewest = null;
const d3d8ScratchVertexAttribKey = {
  vertexBufferId: 0,
  vertexByteOffset: 0,
  vertexStride: 0,
  positionAttrib: -1,
  normalAttrib: -1,
  diffuseAttrib: -1,
  specularAttrib: -1,
  texCoord0Attrib: -1,
  texCoord1Attrib: -1,
  positionComponents: 3,
  pretransformed: 0,
  normalOffset: -1,
  diffuseOffset: -1,
  specularOffset: -1,
  canSampleTexture0: 0,
  texture0UsesVertexTexCoord: 0,
  texture0Offset: -1,
  canSampleTexture1: 0,
  texture1UsesVertexTexCoord: 0,
  texture1Offset: -1,
};
const d3d8DrawMatrixScratch = {
  world: new Float32Array(16),
  view: new Float32Array(16),
  projection: new Float32Array(16),
  xrView: new Float32Array(16),
  xrEngineViewProjection: new Float32Array(16),
  xrEngineViewProjectionInverse: new Float32Array(16),
  xrViewProjection: new Float32Array(16),
  xrClipTransform: new Float32Array(16),
  worldNormal: new Float32Array(9),
};
let d3d8CurrentVertexArray = null;
let d3d8CurrentVertexArrayKey = null;
let d3d8LastMaterialUniformInfo = null;
let d3d8LastFixedLightUniformKey = null;
let d3d8LastStageUniformKey = null;
let d3d8LastAlphaFogUniformKey = null;
// Map<`${colorTextureId}:${depthTextureId}`, {fbo, depthRenderbuffer, width, height}>
const d3d8Framebuffers = new Map();
let d3d8CurrentFramebuffer = null;
let d3d8CurrentFramebufferWidth = 0;
let d3d8CurrentFramebufferHeight = 0;
let d3d8CurrentFramebufferColorTextureId = 0;
let d3d8FramebufferBindSerial = 0;
let d3d8CurrentProgram = null;
let d3d8CurrentArrayBuffer = null;
let d3d8CurrentElementArrayBuffer = null;
let d3d8TemporaryIndexBuffer = null;
let d3d8TemporaryIndexBufferBytes = 0;
let d3d8CurrentDepthMask = true;
let d3d8CurrentColorMask = [true, true, true, true];
let d3d8LastAppliedViewportKey = null;
let d3d8CachedViewportInput = null;
let d3d8CachedNormalizedViewport = null;
let d3d8CurrentRenderGlState = null;

function setD3D8DepthMask(enabled) {
  if (!gl) {
    return;
  }
  const next = Boolean(enabled);
  if (d3d8CurrentDepthMask !== next) {
    gl.depthMask(next);
    d3d8CurrentDepthMask = next;
  }
}

function setD3D8ColorMask(red, green, blue, alpha) {
  if (!gl) {
    return;
  }
  const next = [Boolean(red), Boolean(green), Boolean(blue), Boolean(alpha)];
  if (d3d8CurrentColorMask.some((enabled, index) => enabled !== next[index])) {
    gl.colorMask(next[0], next[1], next[2], next[3]);
    d3d8CurrentColorMask = next;
  }
}

function invalidateD3D8RenderGlStateCache() {
  d3d8CurrentRenderGlState = null;
}

function d3d8RenderGlStateValueChanged(key, value) {
  if (!d3d8CurrentRenderGlState) {
    d3d8CurrentRenderGlState = {};
  }
  if (d3d8CurrentRenderGlState[key] === value) {
    if (d3d8PerfCountersEnabled) d3d8PerfStats.drawRenderStateGlCacheHits += 1;
    return false;
  }
  d3d8CurrentRenderGlState[key] = value;
  if (d3d8PerfCountersEnabled) d3d8PerfStats.drawRenderStateGlCacheMisses += 1;
  return true;
}

function d3d8RenderGlStateTupleChanged(key, first, second, third, fourth) {
  if (!d3d8CurrentRenderGlState) {
    d3d8CurrentRenderGlState = {};
  }
  const previous = d3d8CurrentRenderGlState[key];
  if (previous !== undefined &&
      previous[0] === first && previous[1] === second &&
      previous[2] === third && previous[3] === fourth) {
    if (d3d8PerfCountersEnabled) d3d8PerfStats.drawRenderStateGlCacheHits += 1;
    return false;
  }
  d3d8CurrentRenderGlState[key] = [first, second, third, fourth];
  if (d3d8PerfCountersEnabled) d3d8PerfStats.drawRenderStateGlCacheMisses += 1;
  return true;
}

function setD3D8TrackedCapability(capability, key, enabled) {
  const next = Boolean(enabled);
  if (d3d8RenderGlStateValueChanged(key, next)) {
    if (next) {
      gl.enable(capability);
    } else {
      gl.disable(capability);
    }
  }
}

const D3DUSAGE_RENDERTARGET = 0x00000001;
const D3DUSAGE_WRITEONLY = 0x00000008;
const D3DUSAGE_DEPTHSTENCIL = 0x00000002;
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
const D3DFMT_V8U8 = 60;
const D3DFMT_D16_LOCKABLE = 70;
const D3DFMT_D32 = 71;
const D3DFMT_D15S1 = 73;
const D3DFMT_D24S8 = 75;
const D3DFMT_D24X8 = 77;
const D3DFMT_D24X4S4 = 79;
const D3DFMT_D16 = 80;
const D3DFMT_DXT1 = 0x31545844;
const D3DFMT_DXT2 = 0x32545844;
const D3DFMT_DXT3 = 0x33545844;
const D3DFMT_DXT4 = 0x34545844;
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
const D3DMCS_MATERIAL = 0;
const D3DMCS_COLOR1 = 1;
const D3DMCS_COLOR2 = 2;
const D3DLIGHT_POINT = 1;
const D3DLIGHT_SPOT = 2;
const D3DLIGHT_DIRECTIONAL = 3;
const D3DFILL_POINT = 1;
const D3DFILL_WIREFRAME = 2;
const D3DFILL_SOLID = 3;
const D3DSHADE_FLAT = 1;
const D3DSHADE_GOURAUD = 2;
const D3DSHADE_PHONG = 3;
const D3DPT_POINTLIST = 1;
const D3DPT_LINELIST = 2;
const D3DPT_LINESTRIP = 3;
const D3DPT_TRIANGLELIST = 4;
const D3DPT_TRIANGLESTRIP = 5;
const D3DPT_TRIANGLEFAN = 6;
const D3DSTENCILOP_KEEP = 1;
const D3DSTENCILOP_ZERO = 2;
const D3DSTENCILOP_REPLACE = 3;
const D3DSTENCILOP_INCRSAT = 4;
const D3DSTENCILOP_DECRSAT = 5;
const D3DSTENCILOP_INVERT = 6;
const D3DSTENCILOP_INCR = 7;
const D3DSTENCILOP_DECR = 8;
const D3DFOG_LINEAR = 3;
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
const D3DTOP_BLENDTEXTUREALPHAPM = 15;
const D3DTOP_BLENDCURRENTALPHA = 16;
const D3DTOP_PREMODULATE = 17;
const D3DTOP_MODULATEALPHA_ADDCOLOR = 18;
const D3DTOP_MODULATECOLOR_ADDALPHA = 19;
const D3DTOP_MODULATEINVALPHA_ADDCOLOR = 20;
const D3DTOP_MODULATEINVCOLOR_ADDALPHA = 21;
const D3DTOP_BUMPENVMAP = 22;
const D3DTOP_BUMPENVMAPLUMINANCE = 23;
const D3DTOP_DOTPRODUCT3 = 24;
const D3DTOP_MULTIPLYADD = 25;
const D3DTOP_LERP = 26;
const D3DTA_SELECTMASK = 0x0000000f;
const D3DTA_DIFFUSE = 0;
const D3DTA_CURRENT = 1;
const D3DTA_TEXTURE = 2;
const D3DTA_TFACTOR = 3;
const D3DTA_SPECULAR = 4;
const D3DTA_TEMP = 5;
const D3DTA_COMPLEMENT = 0x00000010;
const D3DTA_ALPHAREPLICATE = 0x00000020;
const D3DTA_SUPPORTED_MODIFIERS = D3DTA_COMPLEMENT | D3DTA_ALPHAREPLICATE;
const D3D8_CLIP_PLANE_COUNT = 6;
const d3d8LastBaseUniformSnapshot = {
  valid: false,
  useTransforms: false,
  pretransformed: false,
  viewportX: 0,
  viewportY: 0,
  viewportWidth: 0,
  viewportHeight: 0,
  depthBiasNdc: 0,
  clipPlaneMask: 0,
  flatShade: false,
  lightingEnabled: false,
  specularEnabled: false,
  normalizeNormals: false,
  localViewer: false,
  colorVertex: false,
  clipPlanes: new Float32Array(D3D8_CLIP_PLANE_COUNT * 4),
};
const D3DTSS_TCI_PASSTHRU = 0x00000000;
const D3DTSS_TCI_CAMERASPACENORMAL = 0x00010000;
const D3DTSS_TCI_CAMERASPACEPOSITION = 0x00020000;
const D3DTSS_TCI_CAMERASPACEREFLECTIONVECTOR = 0x00030000;
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
const D3D8_LIGHT_COUNT = 8;
const WW3D_ACTIVE_LIGHT_COUNT = 4;
const D3D8_DIRECTIONAL_LIGHT_UNIFORM_COUNT = WW3D_ACTIVE_LIGHT_COUNT;
const D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT = WW3D_ACTIVE_LIGHT_COUNT;
const D3DFVF_XYZ = 0x002;
const D3DFVF_XYZRHW = 0x004;
const D3DFVF_XYZB4 = 0x008;
const D3DFVF_NORMAL = 0x010;
const D3DFVF_DIFFUSE = 0x040;
const D3DFVF_SPECULAR = 0x080;
const D3DFVF_TEX1 = 0x100;
const D3DFVF_TEX2 = 0x200;

const D3DFVF_TEXCOUNT_MASK = 0xf00;
const D3DFVF_TEXCOUNT_SHIFT = 8;
const D3D8_NORMAL_OFFSET = 12;
const D3D8_NORMAL_MIN_STRIDE = D3D8_NORMAL_OFFSET + 12;
const D3D8_DIFFUSE_OFFSET = 24;
const D3D8_DIFFUSE_MIN_STRIDE = D3D8_DIFFUSE_OFFSET + 4;
// Matches WW3D2/dx8fvf.h VertexFormatXYZNDUV1/2: XYZ, normal, diffuse, UV0/UV1.
const D3D8_XYZNDUV_TEXCOORD0_OFFSET = 28;
const D3D8_XYZNDUV_TEXCOORD_STRIDE = 8;
const D3D8_XYZNDUV_TEXCOORD_SETS = 2;
const D3D_FLOAT_ONE_BITS = 0x3f800000;
const d3d8FloatBits = new ArrayBuffer(4);
const d3d8FloatView = new DataView(d3d8FloatBits);
const d3d8BufferStats = {
  creates: 0,
  updates: 0,
  releases: 0,
  uploadBytes: 0,
  updateMs: 0,
  bufferSubDataMs: 0,
  mirrorBytes: 0,
  mirrorMs: 0,
  mirrorSkippedBytes: 0,
  lastCreate: null,
  lastStaticCreate: null,
  lastDynamicCreate: null,
  lastUpdate: null,
  lastRelease: null,
};
const d3d8BufferProducerStats = new Map();
const d3d8DrawProducerStats = new Map();
let d3d8ViewportState = null;
// Non-null only while the Window-owned WebXR renderer replays a world draw.
// Matrices are WebGL column-major: viewPrefix is applied ahead of the engine
// camera view, and projection has already been converted to the D3D [0,w]
// depth convention that the shared shader maps back to WebGL [-w,w].
let d3d8XrViewOverride = null;
let browser_fbo_incomplete_count = 0;
// When the player picks an explicit engine render resolution (resolution
// selector / fullscreen auto-native), the WebGL2 backing store must stay at THAT
// size so it matches the engine render target 1:1. Otherwise syncCanvasSize()
// (run every draw) would reset canvas.width/height back to CSS-box x DPR, which
// generally differs in size AND aspect from the engine resolution -> the D3D8
// viewport scale becomes non-uniform (stretched geometry) and screen<->world
// unproject (pick ray / building-placement hover) lands on the wrong point.
// null = follow CSS x DPR (original behavior); {width,height} = pin the store.
let explicitEngineBackingStore = null;
let d3d8CurrentActiveTextureUnit = null;
let d3d8MaxCombinedTextureImageUnits = null;
const d3d8CurrentTexture2DBindings = new Map();
const d3d8CurrentTexture3DBindings = new Map();
const d3d8ViewportStats = {
  sets: 0,
  applications: 0,
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
  dxtDecodes: 0,
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
  lastOffscreenFboBind: null,
  lastTextureDepthFboBind: null,
};
const d3d8PerfStats = {
  draws: 0,
  drawElements: 0,
  drawIndices: 0,
  drawMs: 0,
  drawBatchCandidates: 0,
  drawBatchQueued: 0,
  drawBatchMerged: 0,
  drawBatchFlushes: 0,
  drawBatchSavedDrawElements: 0,
  drawBatchMergedIndices: 0,
  drawBatchMaxRunLength: 0,
  drawDepthStencilOnlyProgramDraws: 0,
  drawDepthStencilNoDiscardDraws: 0,
  drawDepthStencilOnlyFastDerivedDraws: 0,
  destinationAlphaBlendDraws: 0,
  destinationAlphaBlendOffscreenDraws: 0,
  // Terrain noise/cloud/lightmap detail-pass diagnostics. The original
  // TerrainShader2Stage noise/cloud pass (W3DShaderManager.cpp
  // TerrainShader2Stage::set pass 2) binds a noise/cloud texture with
  // D3DTSS_TCI_CAMERASPACEPOSITION generated coords + a D3DTS_TEXTURE0/1
  // texture transform and blends multiplicatively (SRCBLEND=DESTCOLOR,
  // DESTBLEND=ZERO). These counters let the real-GPU harness confirm the
  // detail layer is actually emitted (vs. the LOD/Options gate leaving
  // m_useLightMap/m_useCloudMap off, which yields flat terrain).
  terrainNoiseMultiplyDraws: 0,
  terrainNoiseMultiplyTransformedDraws: 0,
  terrainNoiseMultiplyIdentityTransformDraws: 0,
  // Translated D3D8 SM1 (ps.1.1/vs.1.1) programmable shader path.
  sm1PixelShadersRegistered: 0,
  sm1VertexShadersRegistered: 0,
  sm1PairProgramsLinked: 0,
  sm1PairProgramFailures: 0,
  sm1ShaderDraws: 0,
  sm1TranslatedVsDraws: 0,
  sm1FallbackDraws: 0,
  particleProgramDraws: 0,
  unlitTex2ProgramDraws: 0,
  unlitTex2FixedFunctionDraws: 0,
  unlitTex2SM1Draws: 0,
  simpleFFProgramDraws: 0,
  fastSimpleFFProgramDraws: 0,
  staticSM1ProgramDraws: 0,
  drawMatrixNormalizations: 0,
  drawMatrixScratchCopies: 0,
  drawMatrixAllocatedCopies: 0,
  drawPayloadCalls: 0,
  drawPayloadReused: 0,
  drawClipPlanePayloadCopies: 0,
  drawClipPlanePayloadSkips: 0,
  drawMaterialPayloadCopies: 0,
  drawMaterialPayloadSkips: 0,
  drawLightPayloadCopies: 0,
  drawLightPayloadSkips: 0,
  drawDerivedCacheHits: 0,
  drawDerivedCacheMisses: 0,
  drawFullStateInvalidations: 0,
  drawTextureContentPreservations: 0,
  drawTextureContentInvalidations: 0,
  drawTextureContentInvalidatedEntries: 0,
  drawTextureContentInvalidationMs: 0,
  drawUniformCacheHits: 0,
  drawUniformCacheMisses: 0,
  drawTransformUniformCacheHits: 0,
  drawTransformUniformCacheMisses: 0,
  drawWorldTransformUniformCacheHits: 0,
  drawWorldTransformUniformCacheMisses: 0,
  drawViewTransformUniformCacheHits: 0,
  drawViewTransformUniformCacheMisses: 0,
  drawProjectionTransformUniformCacheHits: 0,
  drawProjectionTransformUniformCacheMisses: 0,
  drawPointSpriteUniformCacheHits: 0,
  drawPointSpriteUniformCacheMisses: 0,
  drawTextureUniformCacheHits: 0,
  drawTextureUniformCacheMisses: 0,
  drawTextureActiveCacheHits: 0,
  drawTextureActiveCacheMisses: 0,
  drawTextureBindCacheHits: 0,
  drawTextureBindCacheMisses: 0,
  drawTextureSamplerCacheHits: 0,
  drawTextureSamplerCacheMisses: 0,
  drawVertexAttribCacheHits: 0,
  drawVertexAttribCacheMisses: 0,
  drawVertexArrayCacheHits: 0,
  drawVertexArrayCacheMisses: 0,
  drawViewportCacheHits: 0,
  drawViewportCacheMisses: 0,
  drawRenderStateGlCacheHits: 0,
  drawRenderStateGlCacheMisses: 0,
  drawBaseUniformCacheHits: 0,
  drawBaseUniformCacheMisses: 0,
  drawMaterialUniformCacheHits: 0,
  drawMaterialUniformCacheMisses: 0,
  drawFixedLightUniformCacheHits: 0,
  drawFixedLightUniformCacheMisses: 0,
  drawStageUniformCacheHits: 0,
  drawStageUniformCacheMisses: 0,
  drawAlphaFogUniformCacheHits: 0,
  drawAlphaFogUniformCacheMisses: 0,
  uniformGlCalls: 0,
  uniformGlSkipped: 0,
  sortedDrawProfiledCalls: 0,
  sortedDrawProfiledMs: 0,
  sortedDrawPreBatchMs: 0,
  sortedDrawDerivedMs: 0,
  sortedDrawTextureDiagMs: 0,
  sortedDrawViewportMs: 0,
  sortedDrawDiagnosticsMs: 0,
  sortedDrawGeometryMs: 0,
  sortedDrawProgramMs: 0,
  sortedDrawFillShadeMs: 0,
  sortedDrawVertexAttribMs: 0,
  sortedDrawTextureBindMs: 0,
  sortedDrawUniformMs: 0,
  sortedDrawApplyRenderStateMs: 0,
  sortedDrawRenderBuildMs: 0,
  sortedDrawRenderBaseUniformMs: 0,
  sortedDrawRenderMaterialUniformMs: 0,
  sortedDrawRenderLightUniformMs: 0,
  sortedDrawRenderStageUniformMs: 0,
  sortedDrawRenderAlphaFogUniformMs: 0,
  sortedDrawRenderUniformMs: 0,
  sortedDrawTransformUniformMs: 0,
  sortedDrawTransformCompareMs: 0,
  sortedDrawWorldTransformUniformMs: 0,
  sortedDrawViewTransformUniformMs: 0,
  sortedDrawProjectionTransformUniformMs: 0,
  sortedDrawPointSpriteUniformMs: 0,
  sortedDrawTextureUniformMs: 0,
  sortedDrawDrawOrBatchMs: 0,
  sortedDrawTailMs: 0,
  clears: 0,
  clearMs: 0,
  clearTotalMs: 0,
  clearInvalidateMs: 0,
  clearSyncCanvasMs: 0,
  clearSetupMs: 0,
  clearContextAttrMs: 0,
  clearDepthMaskCheckMs: 0,
  clearDepthMaskToggleMs: 0,
  clearPostDiagMs: 0,
  textureUploads: 0,
  textureUploadBytes: 0,
  textureUploadPixels: 0,
  textureUploadMs: 0,
  textureConvertBytes: 0,
  textureConvertMs: 0,
  dxtDecodeMs: 0,
  volumeTextureUploads: 0,
  readPixels: 0,
  readPixelsPixels: 0,
  readPixelsMs: 0,
  fboBinds: 0,
  fboBindMs: 0,
  fboCreates: 0,
  fboIncomplete: 0,
  framebufferFeedbackResolves: 0,
  framebufferFeedbackResolveMs: 0,
  bufferUpdates: 0,
  bufferUploadBytes: 0,
  bufferVertexUpdates: 0,
  bufferVertexUploadBytes: 0,
  bufferIndexUpdates: 0,
  bufferIndexUploadBytes: 0,
  bufferDynamicUpdates: 0,
  bufferDynamicUploadBytes: 0,
  bufferDiscardUpdates: 0,
  bufferDiscardUploadBytes: 0,
  bufferNoOverwriteUpdates: 0,
  bufferNoOverwriteUploadBytes: 0,
  bufferOrphanedUpdates: 0,
  bufferDynamicRedirectedUpdates: 0,
  bufferDynamicRangeUploads: 0,
  bufferDynamicRangeUploadBytes: 0,
  bufferDynamicRedirectFallbacks: 0,
  drawDynamicVertexRedirects: 0,
  drawDynamicVertexSharedFallbacks: 0,
  drawDynamicIndexRedirects: 0,
  drawDynamicIndexSharedFallbacks: 0,
  bufferResizedUpdates: 0,
  bufferUpdateMs: 0,
  bufferSubDataMs: 0,
  bufferMirrorBytes: 0,
  bufferMirrorMs: 0,
  bufferMirrorSkippedBytes: 0,
};
const d3d8DrawBatchFlushReasons = new Map();

// Per-GL-op diagnostics are useful to the harness but measurable in draw-flood
// frames. Lite mode keeps both clocks and counters out of the human-play hot
// path; full diagnostics and explicit profiler overrides restore them.
let d3d8PerfTimingEnabled = true;
let d3d8PerfCountersEnabled = true;
function perfNow() {
  if (!d3d8PerfTimingEnabled) {
    return 0;
  }
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function roundedPerfMs(value) {
  return Math.round(Number(value ?? 0) * 1000) / 1000;
}

function bufferProducerLabel(value) {
  const label = typeof value === "string" ? value.trim() : "";
  return label.length > 0 ? label.slice(0, 160) : "(unmarked)";
}

function noteD3D8BufferProducerUpdate({
  producer,
  resource,
  byteLength,
  updateMs,
  subDataMs,
  mirrorMs,
  mirroredBytes,
  skippedMirrorBytes,
  discard,
  noOverwrite,
  orphaned,
  resized,
}) {
  if (!resource) {
    return;
  }
  const label = bufferProducerLabel(producer);
  let entry = d3d8BufferProducerStats.get(label);
  if (!entry) {
    entry = {
      producer: label,
      updates: 0,
      uploadBytes: 0,
      vertexUpdates: 0,
      vertexUploadBytes: 0,
      indexUpdates: 0,
      indexUploadBytes: 0,
      dynamicUpdates: 0,
      dynamicUploadBytes: 0,
      discardUpdates: 0,
      discardUploadBytes: 0,
      noOverwriteUpdates: 0,
      noOverwriteUploadBytes: 0,
      orphanedUpdates: 0,
      resizedUpdates: 0,
      updateMs: 0,
      bufferSubDataMs: 0,
      mirrorMs: 0,
      mirrorBytes: 0,
      mirrorSkippedBytes: 0,
    };
    d3d8BufferProducerStats.set(label, entry);
  }
  entry.updates += 1;
  entry.uploadBytes += byteLength;
  if (resource.kindName === "vertex") {
    entry.vertexUpdates += 1;
    entry.vertexUploadBytes += byteLength;
  } else if (resource.kindName === "index") {
    entry.indexUpdates += 1;
    entry.indexUploadBytes += byteLength;
  }
  if (resource.dynamic) {
    entry.dynamicUpdates += 1;
    entry.dynamicUploadBytes += byteLength;
  }
  if (discard) {
    entry.discardUpdates += 1;
    entry.discardUploadBytes += byteLength;
  }
  if (noOverwrite) {
    entry.noOverwriteUpdates += 1;
    entry.noOverwriteUploadBytes += byteLength;
  }
  if (orphaned) {
    entry.orphanedUpdates += 1;
  }
  if (resized) {
    entry.resizedUpdates += 1;
  }
  entry.updateMs += updateMs;
  entry.bufferSubDataMs += subDataMs;
  entry.mirrorMs += mirrorMs;
  entry.mirrorBytes += mirroredBytes;
  entry.mirrorSkippedBytes += skippedMirrorBytes;
}

function d3d8BufferProducerSummary() {
  if (!d3d8BufferProducerTrackingEnabled) {
    return [];
  }
  return [...d3d8BufferProducerStats.values()]
    .sort((a, b) => b.uploadBytes - a.uploadBytes || b.updates - a.updates)
    .slice(0, 128)
    .map((entry) => ({
      ...entry,
      updateMs: roundedPerfMs(entry.updateMs),
      bufferSubDataMs: roundedPerfMs(entry.bufferSubDataMs),
      mirrorMs: roundedPerfMs(entry.mirrorMs),
    }));
}

const d3d8DrawProducerPhaseSuffixes = [
  "PreBatch",
  "Derived",
  "TextureDiag",
  "Viewport",
  "Diagnostics",
  "Geometry",
  "Program",
  "FillShade",
  "VertexAttrib",
  "TextureBind",
  "Uniform",
  "ApplyRenderState",
  "RenderBuild",
  "RenderBaseUniform",
  "RenderMaterialUniform",
  "RenderLightUniform",
  "RenderStageUniform",
  "RenderAlphaFogUniform",
  "RenderUniform",
  "TransformUniform",
  "TransformCompare",
  "WorldTransformUniform",
  "ViewTransformUniform",
  "ProjectionTransformUniform",
  "PointSpriteUniform",
  "TextureUniform",
  "DrawOrBatch",
  "Tail",
];
const d3d8DrawProducerPhaseFields = d3d8DrawProducerPhaseSuffixes.map((suffix) => [
  `sortedDraw${suffix}Ms`,
  `draw${suffix}Ms`,
]);
const d3d8DrawProducerGenericPhaseFieldBySorted =
  new Map(d3d8DrawProducerPhaseFields);

function initialD3D8DrawProducerPhaseCounters(fieldIndex) {
  const counters = {};
  for (const fields of d3d8DrawProducerPhaseFields) {
    counters[fields[fieldIndex]] = 0;
  }
  return counters;
}

function noteD3D8DrawProducerCall(producer, indexCount, sortedProfiled) {
  if (!d3d8DrawProducerTrackingEnabled) {
    return null;
  }
  const label = bufferProducerLabel(producer);
  let entry = d3d8DrawProducerStats.get(label);
  if (!entry) {
    entry = {
      producer: label,
      calls: 0,
      indices: 0,
      drawProfiledMs: 0,
      ...initialD3D8DrawProducerPhaseCounters(1),
      sortedCalls: 0,
      sortedIndices: 0,
      sortedDrawProfiledMs: 0,
      ...initialD3D8DrawProducerPhaseCounters(0),
    };
    d3d8DrawProducerStats.set(label, entry);
  }
  entry.calls += 1;
  entry.indices += Number(indexCount ?? 0) >>> 0;
  if (sortedProfiled) {
    entry.sortedCalls += 1;
    entry.sortedIndices += Number(indexCount ?? 0) >>> 0;
  }
  return entry;
}

function noteD3D8DrawProducerMs(entry, field, elapsedMs) {
  if (!entry || typeof field !== "string" || !(field in entry)) {
    return;
  }
  entry[field] += elapsedMs;
}

function noteD3D8DrawProducerPhaseMs(entry, sortedField, elapsedMs, sortedProfiled) {
  const genericField = d3d8DrawProducerGenericPhaseFieldBySorted.get(sortedField);
  if (genericField) {
    noteD3D8DrawProducerMs(entry, genericField, elapsedMs);
  }
  if (sortedProfiled) {
    noteD3D8DrawProducerMs(entry, sortedField, elapsedMs);
  }
}

function d3d8DrawProducerSummary() {
  if (!d3d8DrawProducerTrackingEnabled) {
    return [];
  }
  return [...d3d8DrawProducerStats.values()]
    .sort((a, b) =>
      b.drawProfiledMs - a.drawProfiledMs ||
      b.sortedDrawProfiledMs - a.sortedDrawProfiledMs ||
      b.calls - a.calls ||
      b.indices - a.indices)
    .slice(0, 128)
    .map((entry) => {
      const rounded = { ...entry };
      for (const key of Object.keys(rounded)) {
        if (key.endsWith("Ms")) {
          rounded[key] = roundedPerfMs(rounded[key]);
        }
      }
      return rounded;
    });
}

function resetD3D8UniformSubgroupCaches() {
  d3d8LastBaseUniformSnapshot.valid = false;
  d3d8LastMaterialUniformInfo = null;
  d3d8LastFixedLightUniformKey = null;
  d3d8LastStageUniformKey = null;
  d3d8LastAlphaFogUniformKey = null;
}

function invalidateD3D8AppliedViewportCache() {
  d3d8LastAppliedViewportKey = null;
}

function invalidateD3D8NormalizedViewportCache() {
  d3d8CachedViewportInput = null;
  d3d8CachedNormalizedViewport = null;
}

function d3d8ViewportAppliedKeyMatches(left, right) {
  return Boolean(
    left && right &&
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height &&
    left.minZ === right.minZ &&
    left.maxZ === right.maxZ &&
    left.drawingBufferWidth === right.drawingBufferWidth &&
    left.drawingBufferHeight === right.drawingBufferHeight
  );
}

function d3d8ViewportInputMatches(input, payload, bufferWidth, bufferHeight) {
  return Boolean(
    input &&
    input.x === payload.x &&
    input.y === payload.y &&
    input.width === payload.width &&
    input.height === payload.height &&
    input.minZ === payload.minZ &&
    input.maxZ === payload.maxZ &&
    input.targetWidth === payload.targetWidth &&
    input.targetHeight === payload.targetHeight &&
    input.bufferWidth === bufferWidth &&
    input.bufferHeight === bufferHeight
  );
}

function d3d8PerfSummary() {
  const gpuFrameTimer = d3d8GpuFrameTimerSummary();
  let dynamicRangePoolSlots = 0;
  for (const pool of d3d8DynamicRangeSlotPools.values()) {
    dynamicRangePoolSlots += pool.length;
  }
  let pendingBufferRetirementSlots = 0;
  for (const retirement of d3d8BufferRetirements) {
    pendingBufferRetirementSlots += retirement.slots.length;
  }
  let activeDynamicRangeSlots = 0;
  for (const resource of d3d8Buffers.values()) {
    if (resource.dynSharedSlot?.buffer) {
      activeDynamicRangeSlots += 1;
    }
    if (Array.isArray(resource.dynRanges)) {
      for (const range of resource.dynRanges) {
        if (range?.slot?.buffer) {
          activeDynamicRangeSlots += 1;
        }
      }
    }
  }
  return {
    diagLevel: d3d8DiagLevel,
    countersEnabled: d3d8PerfCountersEnabled,
    timingEnabled: d3d8PerfTimingEnabled,
    gpuFrameTimer,
    gpuFrameTimerSampleCount: gpuFrameTimer.sampleCount,
    gpuFrameTimerTotalMs: gpuFrameTimer.totalMs,
    gpuFrameTimerDisjointSamples: gpuFrameTimer.disjointSamples,
    vertexArrayCacheEntries: d3d8VertexArrayCacheEntries,
    vertexArrayCachePeakEntries: d3d8VertexArrayCachePeakEntries,
    vertexArrayCacheEvictions: d3d8VertexArrayCacheEvictions,
    vertexArrayCacheInvalidations: d3d8VertexArrayCacheInvalidations,
    vertexArrayCacheInvalidatedEntries: d3d8VertexArrayCacheInvalidatedEntries,
    vertexArrayCacheLimit: D3D8_VERTEX_ARRAY_CACHE_LIMIT,
    renamedBuffers: d3d8RenamedBufferCounter,
    dynamicRangeSlots: d3d8DynamicRangeSlotCounter,
    dynamicRangeSlotsDeleted: d3d8DynamicRangeSlotsDeleted,
    dynamicRangePoolLimitPerTarget: D3D8_DYNAMIC_RANGE_POOL_LIMIT_PER_TARGET,
    dynamicRangePoolSlots,
    activeDynamicRangeSlots,
    pendingBufferRetirements: d3d8BufferRetirements.length,
    pendingBufferRetirementSlots,
    draws: d3d8PerfStats.draws,
    drawElements: d3d8PerfStats.drawElements,
    drawIndices: d3d8PerfStats.drawIndices,
    drawMs: roundedPerfMs(d3d8PerfStats.drawMs),
    drawBatchCandidates: d3d8PerfStats.drawBatchCandidates,
    drawBatchQueued: d3d8PerfStats.drawBatchQueued,
    drawBatchMerged: d3d8PerfStats.drawBatchMerged,
    drawBatchFlushes: d3d8PerfStats.drawBatchFlushes,
    drawBatchSavedDrawElements: d3d8PerfStats.drawBatchSavedDrawElements,
    drawBatchMergedIndices: d3d8PerfStats.drawBatchMergedIndices,
    drawBatchMaxRunLength: d3d8PerfStats.drawBatchMaxRunLength,
    drawBatchFlushReasons: Object.fromEntries(
      [...d3d8DrawBatchFlushReasons.entries()].sort((left, right) =>
        right[1] - left[1] || left[0].localeCompare(right[0]))),
    drawDepthStencilOnlyProgramDraws: d3d8PerfStats.drawDepthStencilOnlyProgramDraws,
    drawDepthStencilNoDiscardDraws: d3d8PerfStats.drawDepthStencilNoDiscardDraws,
    drawDepthStencilOnlyFastDerivedDraws: d3d8PerfStats.drawDepthStencilOnlyFastDerivedDraws,
    destinationAlphaBlendDraws: d3d8PerfStats.destinationAlphaBlendDraws,
    destinationAlphaBlendOffscreenDraws: d3d8PerfStats.destinationAlphaBlendOffscreenDraws,
    terrainNoiseMultiplyDraws: d3d8PerfStats.terrainNoiseMultiplyDraws,
    terrainNoiseMultiplyTransformedDraws: d3d8PerfStats.terrainNoiseMultiplyTransformedDraws,
    terrainNoiseMultiplyIdentityTransformDraws: d3d8PerfStats.terrainNoiseMultiplyIdentityTransformDraws,
    sm1PixelShadersRegistered: d3d8PerfStats.sm1PixelShadersRegistered,
    sm1VertexShadersRegistered: d3d8PerfStats.sm1VertexShadersRegistered,
    sm1PairProgramsLinked: d3d8PerfStats.sm1PairProgramsLinked,
    sm1PairProgramFailures: d3d8PerfStats.sm1PairProgramFailures,
    sm1ShaderDraws: d3d8PerfStats.sm1ShaderDraws,
    sm1TranslatedVsDraws: d3d8PerfStats.sm1TranslatedVsDraws,
    sm1FallbackDraws: d3d8PerfStats.sm1FallbackDraws,
    particleProgramDraws: d3d8PerfStats.particleProgramDraws,
    unlitTex2ProgramDraws: d3d8PerfStats.unlitTex2ProgramDraws,
    unlitTex2FixedFunctionDraws: d3d8PerfStats.unlitTex2FixedFunctionDraws,
    unlitTex2SM1Draws: d3d8PerfStats.unlitTex2SM1Draws,
    simpleFFProgramDraws: d3d8PerfStats.simpleFFProgramDraws,
    fastSimpleFFProgramDraws: d3d8PerfStats.fastSimpleFFProgramDraws,
    staticSM1ProgramDraws: d3d8PerfStats.staticSM1ProgramDraws,
    drawMatrixNormalizations: d3d8PerfStats.drawMatrixNormalizations,
    drawMatrixScratchCopies: d3d8PerfStats.drawMatrixScratchCopies,
    drawMatrixAllocatedCopies: d3d8PerfStats.drawMatrixAllocatedCopies,
    drawPayloadCalls: d3d8PerfStats.drawPayloadCalls,
    drawPayloadReused: d3d8PerfStats.drawPayloadReused,
    drawClipPlanePayloadCopies: d3d8PerfStats.drawClipPlanePayloadCopies,
    drawClipPlanePayloadSkips: d3d8PerfStats.drawClipPlanePayloadSkips,
    drawMaterialPayloadCopies: d3d8PerfStats.drawMaterialPayloadCopies,
    drawMaterialPayloadSkips: d3d8PerfStats.drawMaterialPayloadSkips,
    drawLightPayloadCopies: d3d8PerfStats.drawLightPayloadCopies,
    drawLightPayloadSkips: d3d8PerfStats.drawLightPayloadSkips,
    drawDerivedCacheHits: d3d8PerfStats.drawDerivedCacheHits,
    drawDerivedCacheMisses: d3d8PerfStats.drawDerivedCacheMisses,
    drawFullStateInvalidations: d3d8PerfStats.drawFullStateInvalidations,
    drawTextureContentPreservations: d3d8PerfStats.drawTextureContentPreservations,
    drawTextureContentInvalidations: d3d8PerfStats.drawTextureContentInvalidations,
    drawTextureContentInvalidatedEntries:
      d3d8PerfStats.drawTextureContentInvalidatedEntries,
    drawTextureContentInvalidationMs:
      roundedPerfMs(d3d8PerfStats.drawTextureContentInvalidationMs),
    drawUniformCacheHits: d3d8PerfStats.drawUniformCacheHits,
    drawUniformCacheMisses: d3d8PerfStats.drawUniformCacheMisses,
    drawTransformUniformCacheHits: d3d8PerfStats.drawTransformUniformCacheHits,
    drawTransformUniformCacheMisses: d3d8PerfStats.drawTransformUniformCacheMisses,
    drawWorldTransformUniformCacheHits: d3d8PerfStats.drawWorldTransformUniformCacheHits,
    drawWorldTransformUniformCacheMisses: d3d8PerfStats.drawWorldTransformUniformCacheMisses,
    drawViewTransformUniformCacheHits: d3d8PerfStats.drawViewTransformUniformCacheHits,
    drawViewTransformUniformCacheMisses: d3d8PerfStats.drawViewTransformUniformCacheMisses,
    drawProjectionTransformUniformCacheHits: d3d8PerfStats.drawProjectionTransformUniformCacheHits,
    drawProjectionTransformUniformCacheMisses: d3d8PerfStats.drawProjectionTransformUniformCacheMisses,
    drawPointSpriteUniformCacheHits: d3d8PerfStats.drawPointSpriteUniformCacheHits,
    drawPointSpriteUniformCacheMisses: d3d8PerfStats.drawPointSpriteUniformCacheMisses,
    drawTextureUniformCacheHits: d3d8PerfStats.drawTextureUniformCacheHits,
    drawTextureUniformCacheMisses: d3d8PerfStats.drawTextureUniformCacheMisses,
    drawTextureActiveCacheHits: d3d8PerfStats.drawTextureActiveCacheHits,
    drawTextureActiveCacheMisses: d3d8PerfStats.drawTextureActiveCacheMisses,
    drawTextureBindCacheHits: d3d8PerfStats.drawTextureBindCacheHits,
    drawTextureBindCacheMisses: d3d8PerfStats.drawTextureBindCacheMisses,
    drawTextureSamplerCacheHits: d3d8PerfStats.drawTextureSamplerCacheHits,
    drawTextureSamplerCacheMisses: d3d8PerfStats.drawTextureSamplerCacheMisses,
    drawVertexAttribCacheHits: d3d8PerfStats.drawVertexAttribCacheHits,
    drawVertexAttribCacheMisses: d3d8PerfStats.drawVertexAttribCacheMisses,
    drawVertexArrayCacheHits: d3d8PerfStats.drawVertexArrayCacheHits,
    drawVertexArrayCacheMisses: d3d8PerfStats.drawVertexArrayCacheMisses,
    drawViewportCacheHits: d3d8PerfStats.drawViewportCacheHits,
    drawViewportCacheMisses: d3d8PerfStats.drawViewportCacheMisses,
    drawRenderStateGlCacheHits: d3d8PerfStats.drawRenderStateGlCacheHits,
    drawRenderStateGlCacheMisses: d3d8PerfStats.drawRenderStateGlCacheMisses,
    drawBaseUniformCacheHits: d3d8PerfStats.drawBaseUniformCacheHits,
    drawBaseUniformCacheMisses: d3d8PerfStats.drawBaseUniformCacheMisses,
    drawMaterialUniformCacheHits: d3d8PerfStats.drawMaterialUniformCacheHits,
    drawMaterialUniformCacheMisses: d3d8PerfStats.drawMaterialUniformCacheMisses,
    drawFixedLightUniformCacheHits: d3d8PerfStats.drawFixedLightUniformCacheHits,
    drawFixedLightUniformCacheMisses: d3d8PerfStats.drawFixedLightUniformCacheMisses,
    drawStageUniformCacheHits: d3d8PerfStats.drawStageUniformCacheHits,
    drawStageUniformCacheMisses: d3d8PerfStats.drawStageUniformCacheMisses,
    drawAlphaFogUniformCacheHits: d3d8PerfStats.drawAlphaFogUniformCacheHits,
    drawAlphaFogUniformCacheMisses: d3d8PerfStats.drawAlphaFogUniformCacheMisses,
    uniformGlCalls: d3d8PerfStats.uniformGlCalls,
    uniformGlSkipped: d3d8PerfStats.uniformGlSkipped,
    sortedDrawProfiledCalls: d3d8PerfStats.sortedDrawProfiledCalls,
    sortedDrawProfiledMs: roundedPerfMs(d3d8PerfStats.sortedDrawProfiledMs),
    sortedDrawPreBatchMs: roundedPerfMs(d3d8PerfStats.sortedDrawPreBatchMs),
    sortedDrawDerivedMs: roundedPerfMs(d3d8PerfStats.sortedDrawDerivedMs),
    sortedDrawTextureDiagMs: roundedPerfMs(d3d8PerfStats.sortedDrawTextureDiagMs),
    sortedDrawViewportMs: roundedPerfMs(d3d8PerfStats.sortedDrawViewportMs),
    sortedDrawDiagnosticsMs: roundedPerfMs(d3d8PerfStats.sortedDrawDiagnosticsMs),
    sortedDrawGeometryMs: roundedPerfMs(d3d8PerfStats.sortedDrawGeometryMs),
    sortedDrawProgramMs: roundedPerfMs(d3d8PerfStats.sortedDrawProgramMs),
    sortedDrawFillShadeMs: roundedPerfMs(d3d8PerfStats.sortedDrawFillShadeMs),
    sortedDrawVertexAttribMs: roundedPerfMs(d3d8PerfStats.sortedDrawVertexAttribMs),
    sortedDrawTextureBindMs: roundedPerfMs(d3d8PerfStats.sortedDrawTextureBindMs),
    sortedDrawUniformMs: roundedPerfMs(d3d8PerfStats.sortedDrawUniformMs),
    sortedDrawApplyRenderStateMs: roundedPerfMs(d3d8PerfStats.sortedDrawApplyRenderStateMs),
    sortedDrawRenderBuildMs: roundedPerfMs(d3d8PerfStats.sortedDrawRenderBuildMs),
    sortedDrawRenderBaseUniformMs: roundedPerfMs(d3d8PerfStats.sortedDrawRenderBaseUniformMs),
    sortedDrawRenderMaterialUniformMs: roundedPerfMs(d3d8PerfStats.sortedDrawRenderMaterialUniformMs),
    sortedDrawRenderLightUniformMs: roundedPerfMs(d3d8PerfStats.sortedDrawRenderLightUniformMs),
    sortedDrawRenderStageUniformMs: roundedPerfMs(d3d8PerfStats.sortedDrawRenderStageUniformMs),
    sortedDrawRenderAlphaFogUniformMs: roundedPerfMs(d3d8PerfStats.sortedDrawRenderAlphaFogUniformMs),
    sortedDrawRenderUniformMs: roundedPerfMs(d3d8PerfStats.sortedDrawRenderUniformMs),
    sortedDrawTransformUniformMs: roundedPerfMs(d3d8PerfStats.sortedDrawTransformUniformMs),
    sortedDrawTransformCompareMs: roundedPerfMs(d3d8PerfStats.sortedDrawTransformCompareMs),
    sortedDrawWorldTransformUniformMs: roundedPerfMs(d3d8PerfStats.sortedDrawWorldTransformUniformMs),
    sortedDrawViewTransformUniformMs: roundedPerfMs(d3d8PerfStats.sortedDrawViewTransformUniformMs),
    sortedDrawProjectionTransformUniformMs: roundedPerfMs(d3d8PerfStats.sortedDrawProjectionTransformUniformMs),
    sortedDrawPointSpriteUniformMs: roundedPerfMs(d3d8PerfStats.sortedDrawPointSpriteUniformMs),
    sortedDrawTextureUniformMs: roundedPerfMs(d3d8PerfStats.sortedDrawTextureUniformMs),
    sortedDrawDrawOrBatchMs: roundedPerfMs(d3d8PerfStats.sortedDrawDrawOrBatchMs),
    sortedDrawTailMs: roundedPerfMs(d3d8PerfStats.sortedDrawTailMs),
    clears: d3d8PerfStats.clears,
    clearMs: roundedPerfMs(d3d8PerfStats.clearMs),
    clearTotalMs: roundedPerfMs(d3d8PerfStats.clearTotalMs),
    clearInvalidateMs: roundedPerfMs(d3d8PerfStats.clearInvalidateMs),
    clearSyncCanvasMs: roundedPerfMs(d3d8PerfStats.clearSyncCanvasMs),
    clearSetupMs: roundedPerfMs(d3d8PerfStats.clearSetupMs),
    clearContextAttrMs: roundedPerfMs(d3d8PerfStats.clearContextAttrMs),
    clearDepthMaskCheckMs: roundedPerfMs(d3d8PerfStats.clearDepthMaskCheckMs),
    clearDepthMaskToggleMs: roundedPerfMs(d3d8PerfStats.clearDepthMaskToggleMs),
    clearPostDiagMs: roundedPerfMs(d3d8PerfStats.clearPostDiagMs),
    textureUploads: d3d8PerfStats.textureUploads,
    textureUploadBytes: d3d8PerfStats.textureUploadBytes,
    textureUploadPixels: d3d8PerfStats.textureUploadPixels,
    textureUploadMs: roundedPerfMs(d3d8PerfStats.textureUploadMs),
    textureConvertBytes: d3d8PerfStats.textureConvertBytes,
    textureConvertMs: roundedPerfMs(d3d8PerfStats.textureConvertMs),
    dxtDecodeMs: roundedPerfMs(d3d8PerfStats.dxtDecodeMs),
    volumeTextureUploads: d3d8PerfStats.volumeTextureUploads,
    readPixels: d3d8PerfStats.readPixels,
    readPixelsPixels: d3d8PerfStats.readPixelsPixels,
    readPixelsMs: roundedPerfMs(d3d8PerfStats.readPixelsMs),
    fboBinds: d3d8PerfStats.fboBinds,
    fboBindMs: roundedPerfMs(d3d8PerfStats.fboBindMs),
    fboCreates: d3d8PerfStats.fboCreates,
    fboIncomplete: d3d8PerfStats.fboIncomplete,
    framebufferFeedbackResolves: d3d8PerfStats.framebufferFeedbackResolves,
    framebufferFeedbackResolveMs: roundedPerfMs(d3d8PerfStats.framebufferFeedbackResolveMs),
    bufferUpdates: d3d8PerfStats.bufferUpdates,
    bufferUploadBytes: d3d8PerfStats.bufferUploadBytes,
    bufferVertexUpdates: d3d8PerfStats.bufferVertexUpdates,
    bufferVertexUploadBytes: d3d8PerfStats.bufferVertexUploadBytes,
    bufferIndexUpdates: d3d8PerfStats.bufferIndexUpdates,
    bufferIndexUploadBytes: d3d8PerfStats.bufferIndexUploadBytes,
    bufferDynamicUpdates: d3d8PerfStats.bufferDynamicUpdates,
    bufferDynamicUploadBytes: d3d8PerfStats.bufferDynamicUploadBytes,
    bufferDiscardUpdates: d3d8PerfStats.bufferDiscardUpdates,
    bufferDiscardUploadBytes: d3d8PerfStats.bufferDiscardUploadBytes,
    bufferNoOverwriteUpdates: d3d8PerfStats.bufferNoOverwriteUpdates,
    bufferNoOverwriteUploadBytes: d3d8PerfStats.bufferNoOverwriteUploadBytes,
    bufferOrphanedUpdates: d3d8PerfStats.bufferOrphanedUpdates,
    bufferDynamicRedirectedUpdates: d3d8PerfStats.bufferDynamicRedirectedUpdates,
    bufferDynamicRangeUploads: d3d8PerfStats.bufferDynamicRangeUploads,
    bufferDynamicRangeUploadBytes: d3d8PerfStats.bufferDynamicRangeUploadBytes,
    bufferDynamicRedirectFallbacks: d3d8PerfStats.bufferDynamicRedirectFallbacks,
    drawDynamicVertexRedirects: d3d8PerfStats.drawDynamicVertexRedirects,
    drawDynamicVertexSharedFallbacks: d3d8PerfStats.drawDynamicVertexSharedFallbacks,
    drawDynamicIndexRedirects: d3d8PerfStats.drawDynamicIndexRedirects,
    drawDynamicIndexSharedFallbacks: d3d8PerfStats.drawDynamicIndexSharedFallbacks,
    bufferResizedUpdates: d3d8PerfStats.bufferResizedUpdates,
    bufferUpdateMs: roundedPerfMs(d3d8PerfStats.bufferUpdateMs),
    bufferSubDataMs: roundedPerfMs(d3d8PerfStats.bufferSubDataMs),
    bufferMirrorBytes: d3d8PerfStats.bufferMirrorBytes,
    bufferMirrorMs: roundedPerfMs(d3d8PerfStats.bufferMirrorMs),
    bufferMirrorSkippedBytes: d3d8PerfStats.bufferMirrorSkippedBytes,
    bufferProducerTracking: d3d8BufferProducerTrackingEnabled,
    bufferProducers: d3d8BufferProducerSummary(),
    drawProducerTracking: d3d8DrawProducerTrackingEnabled,
    drawProducers: d3d8DrawProducerSummary(),
  };
}

const D3D8_GAMMA_FILTER_ID = "cnc-d3d8-gamma-filter";
const D3D8_GAMMA_SVG_NS = "http://www.w3.org/2000/svg";
let d3d8GammaFilterNodes = null;

function invalidateD3D8DrawStateCache() {
  flushD3D8PendingDrawBatch("stateInvalidated");
  if (d3d8PerfCountersEnabled) d3d8PerfStats.drawFullStateInvalidations += 1;
  harnessState.graphics.lastD3D8StateHash = 0;
  harnessState.graphics.lastD3D8UniformKey = null;
  harnessState.graphics.lastD3D8TextureUniformKey = null;
  harnessState.graphics.lastD3D8AppliedRenderState = null;
  d3d8LastDrawKey = null;
  d3d8CachedDerived = null;
  clearD3D8DerivedDrawCache();
  resetD3D8TransformUniformCache();
  d3d8LastPointSpriteUniformInfo = null;
  d3d8LastVertexAttribKey = null;
  d3d8LastDefaultVertexAttribKey = null;
  invalidateD3D8AppliedViewportCache();
  invalidateD3D8RenderGlStateCache();
  resetD3D8UniformSubgroupCaches();
}

// Raw WebXR compositor/UI commands share this WebGL2 context with the D3D8
// executor. Forget every cached GL identity/state they can disturb so the next
// engine draw rebinds its real program, VAO, buffers, textures, and write masks.
function invalidateD3D8ExternalGlState() {
  invalidateD3D8DrawStateCache();
  d3d8CurrentProgram = null;
  d3d8CurrentVertexArray = null;
  d3d8CurrentVertexArrayKey = null;
  d3d8CurrentArrayBuffer = null;
  d3d8CurrentElementArrayBuffer = null;
  d3d8CurrentDepthMask = null;
  d3d8CurrentColorMask = [null, null, null, null];
  invalidateD3D8GlTextureBindingCache();
}

function clearD3D8DerivedDrawCache() {
  d3d8DerivedDrawCache.clear();
  d3d8DerivedDrawCacheEntries = 0;
  d3d8DerivedDrawCacheOldest = null;
  d3d8DerivedDrawCacheNewest = null;
}

function touchD3D8DerivedDrawCacheEntry(entry) {
  if (!entry || entry === d3d8DerivedDrawCacheNewest) {
    return;
  }
  if (entry.lruPrevious) {
    entry.lruPrevious.lruNext = entry.lruNext;
  } else if (entry === d3d8DerivedDrawCacheOldest) {
    d3d8DerivedDrawCacheOldest = entry.lruNext;
  }
  if (entry.lruNext) {
    entry.lruNext.lruPrevious = entry.lruPrevious;
  }
  entry.lruPrevious = d3d8DerivedDrawCacheNewest;
  entry.lruNext = null;
  if (d3d8DerivedDrawCacheNewest) {
    d3d8DerivedDrawCacheNewest.lruNext = entry;
  } else {
    d3d8DerivedDrawCacheOldest = entry;
  }
  d3d8DerivedDrawCacheNewest = entry;
}

function unlinkD3D8DerivedDrawCacheEntry(entry) {
  if (entry.lruPrevious) {
    entry.lruPrevious.lruNext = entry.lruNext;
  } else if (entry === d3d8DerivedDrawCacheOldest) {
    d3d8DerivedDrawCacheOldest = entry.lruNext;
  }
  if (entry.lruNext) {
    entry.lruNext.lruPrevious = entry.lruPrevious;
  } else if (entry === d3d8DerivedDrawCacheNewest) {
    d3d8DerivedDrawCacheNewest = entry.lruPrevious;
  }
  entry.lruPrevious = null;
  entry.lruNext = null;
}

function deleteD3D8DerivedDrawCacheEntry(entry) {
  if (!entry) {
    return;
  }
  const bucket = d3d8DerivedDrawCache.get(entry.derivedStateHash);
  const bucketIndex = bucket?.indexOf(entry) ?? -1;
  unlinkD3D8DerivedDrawCacheEntry(entry);
  if (bucketIndex < 0) {
    d3d8DerivedDrawCacheEntries = Math.max(0, d3d8DerivedDrawCacheEntries - 1);
    return;
  }
  bucket.splice(bucketIndex, 1);
  d3d8DerivedDrawCacheEntries -= 1;
  if (bucket.length === 0) {
    d3d8DerivedDrawCache.delete(entry.derivedStateHash);
  }
}

function d3d8DerivedDrawCacheEntryUsesTexture(entry, textureId) {
  return entry?.texture0Id === textureId ||
    entry?.texture1Id === textureId ||
    entry?.texture2Id === textureId ||
    entry?.texture3Id === textureId;
}

function invalidateD3D8TextureContentState(textureId) {
  const id = Number(textureId ?? 0) >>> 0;
  if (id === 0) {
    return;
  }
  const startedAt = d3d8PerfTimingEnabled ? perfNow() : 0;
  if (d3d8PerfCountersEnabled) d3d8PerfStats.drawTextureContentInvalidations += 1;
  const currentEntryUsesTexture = d3d8DerivedDrawCacheEntryUsesTexture(d3d8LastDrawKey, id);
  let invalidatedEntries = 0;
  for (let entry = d3d8DerivedDrawCacheOldest; entry;) {
    const next = entry.lruNext;
    if (d3d8DerivedDrawCacheEntryUsesTexture(entry, id)) {
      deleteD3D8DerivedDrawCacheEntry(entry);
      invalidatedEntries += 1;
    }
    entry = next;
  }
  if (d3d8PerfCountersEnabled) {
    d3d8PerfStats.drawTextureContentInvalidatedEntries += invalidatedEntries;
  }
  if (currentEntryUsesTexture) {
    d3d8LastDrawKey = null;
    d3d8CachedDerived = null;
    // Texture metadata can change legacy semantic swizzles and the implicit
    // alpha-cutout decision. Only the texture-layout group depends on those
    // values; render state, transforms, and the active GL program do not.
    harnessState.graphics.lastD3D8TextureUniformKey = null;
  }
  if (d3d8PerfTimingEnabled) {
    d3d8PerfStats.drawTextureContentInvalidationMs += perfNow() - startedAt;
  }
}

function d3d8DerivedDrawCacheEntryMatches(
  entry,
  derivedStateHash,
  texture0Id,
  texture1Id,
  texture2Id,
  texture3Id,
  vertexShaderFvf,
  vertexStride,
  primitiveType,
) {
  return entry.derivedStateHash === derivedStateHash &&
    entry.texture0Id === texture0Id &&
    entry.texture1Id === texture1Id &&
    entry.texture2Id === texture2Id &&
    entry.texture3Id === texture3Id &&
    entry.vertexShaderFvf === vertexShaderFvf &&
    entry.vertexStride === vertexStride &&
    entry.primitiveType === primitiveType;
}

function findD3D8DerivedDrawCacheEntry(
  derivedStateHash,
  texture0Id,
  texture1Id,
  texture2Id,
  texture3Id,
  vertexShaderFvf,
  vertexStride,
  primitiveType,
) {
  const bucket = d3d8DerivedDrawCache.get(derivedStateHash);
  if (!bucket) {
    return null;
  }
  for (const entry of bucket) {
    if (d3d8DerivedDrawCacheEntryMatches(
      entry,
      derivedStateHash,
      texture0Id,
      texture1Id,
      texture2Id,
      texture3Id,
      vertexShaderFvf,
      vertexStride,
      primitiveType,
    )) {
      touchD3D8DerivedDrawCacheEntry(entry);
      return entry;
    }
  }
  return null;
}

function evictOldestD3D8DerivedDrawCacheEntry() {
  const entry = d3d8DerivedDrawCacheOldest;
  if (!entry) {
    return;
  }
  deleteD3D8DerivedDrawCacheEntry(entry);
}

function rememberD3D8DerivedDrawCacheEntry(
  derivedStateHash,
  texture0Id,
  texture1Id,
  texture2Id,
  texture3Id,
  vertexShaderFvf,
  vertexStride,
  primitiveType,
  derived,
) {
  let bucket = d3d8DerivedDrawCache.get(derivedStateHash);
  if (!bucket) {
    bucket = [];
    d3d8DerivedDrawCache.set(derivedStateHash, bucket);
  }
  for (const entry of bucket) {
    if (d3d8DerivedDrawCacheEntryMatches(
      entry,
      derivedStateHash,
      texture0Id,
      texture1Id,
      texture2Id,
      texture3Id,
      vertexShaderFvf,
      vertexStride,
      primitiveType,
    )) {
      entry.derived = derived;
      touchD3D8DerivedDrawCacheEntry(entry);
      return entry;
    }
  }
  const entry = {
    derivedStateHash,
    texture0Id,
    texture1Id,
    texture2Id,
    texture3Id,
    vertexShaderFvf,
    vertexStride,
    primitiveType,
    derived,
    lruPrevious: null,
    lruNext: null,
  };
  bucket.push(entry);
  touchD3D8DerivedDrawCacheEntry(entry);
  d3d8DerivedDrawCacheEntries += 1;
  while (d3d8DerivedDrawCacheEntries > D3D8_DERIVED_DRAW_CACHE_LIMIT) {
    evictOldestD3D8DerivedDrawCacheEntry();
  }
  return entry;
}

const d3d8WarnedOnce = new Set();

function warnD3D8Once(key, message, detail = {}) {
  if (d3d8WarnedOnce.has(key)) {
    return;
  }
  d3d8WarnedOnce.add(key);
  const warning = {
    key,
    message,
    ...detail,
  };
  const warnings = Array.isArray(harnessState.graphics.d3d8Warnings)
    ? harnessState.graphics.d3d8Warnings.slice(-63)
    : [];
  warnings.push(warning);
  harnessState.graphics.d3d8Warnings = warnings;
  console.warn(`[D3D8 bridge] ${message}`, detail);
}

function roundedD3D8GammaMetric(value) {
  return Math.round(Number(value) * 1000000) / 1000000;
}

function clampD3D8RampWord(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0;
  }
  return Math.max(0, Math.min(65535, Math.trunc(number)));
}

function copyD3D8GammaRampChannel(values) {
  const source = Array.isArray(values) || ArrayBuffer.isView(values) ? values : [];
  const ramp = new Array(256);
  for (let i = 0; i < 256; i++) {
    ramp[i] = clampD3D8RampWord(source[i] ?? 0);
  }
  return ramp;
}

function sampleD3D8GammaRampChannel(ramp) {
  return [0, 64, 128, 192, 255].map((index) => ramp[index] ?? 0);
}

function estimateD3D8GammaChannel(ramp) {
  const first = (ramp[0] ?? 0) / 65535;
  const mid = (ramp[128] ?? 0) / 65535;
  const last = (ramp[255] ?? 0) / 65535;
  const amplitude = last - first;
  let exponent = 1;
  if (amplitude > 1 / 65535) {
    const normalizedMid = Math.max(0.000001, Math.min(0.999999, (mid - first) / amplitude));
    const inputMid = 128 / 256;
    exponent = Math.log(normalizedMid) / Math.log(inputMid);
    if (!Number.isFinite(exponent) || exponent <= 0) {
      exponent = 1;
    }
  }
  return {
    offset: roundedD3D8GammaMetric(first),
    amplitude: roundedD3D8GammaMetric(Math.max(0, amplitude)),
    exponent: roundedD3D8GammaMetric(exponent),
    gamma: roundedD3D8GammaMetric(1 / exponent),
    samples: {
      first: ramp[0] ?? 0,
      mid: ramp[128] ?? 0,
      last: ramp[255] ?? 0,
    },
  };
}

function d3d8GammaChannelIsIdentity(channel) {
  return Math.abs(channel.offset) <= 0.01
    && Math.abs(channel.amplitude - 1) <= 0.015
    && Math.abs(channel.exponent - 1) <= 0.02;
}

function ensureD3D8GammaFilterNodes() {
  if (d3d8GammaFilterNodes) {
    return d3d8GammaFilterNodes;
  }

  const svg = document.createElementNS(D3D8_GAMMA_SVG_NS, "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.style.position = "absolute";
  svg.style.width = "0";
  svg.style.height = "0";
  svg.style.overflow = "hidden";

  const filter = document.createElementNS(D3D8_GAMMA_SVG_NS, "filter");
  filter.setAttribute("id", D3D8_GAMMA_FILTER_ID);
  filter.setAttribute("color-interpolation-filters", "sRGB");

  const transfer = document.createElementNS(D3D8_GAMMA_SVG_NS, "feComponentTransfer");
  const red = document.createElementNS(D3D8_GAMMA_SVG_NS, "feFuncR");
  const green = document.createElementNS(D3D8_GAMMA_SVG_NS, "feFuncG");
  const blue = document.createElementNS(D3D8_GAMMA_SVG_NS, "feFuncB");
  const alpha = document.createElementNS(D3D8_GAMMA_SVG_NS, "feFuncA");
  alpha.setAttribute("type", "identity");
  transfer.append(red, green, blue, alpha);
  filter.append(transfer);
  svg.append(filter);
  (document.body ?? document.documentElement).append(svg);

  d3d8GammaFilterNodes = { svg, filter, red, green, blue };
  return d3d8GammaFilterNodes;
}

function formatD3D8GammaFilterNumber(value) {
  const number = Number(value);
  return String(Math.round((Number.isFinite(number) ? number : 0) * 1000000) / 1000000);
}

function d3d8GammaRampTableValues(ramp) {
  return ramp.map((value) => formatD3D8GammaFilterNumber((value ?? 0) / 65535)).join(" ");
}

function applyD3D8GammaTableFunction(node, ramp) {
  node.setAttribute("type", "table");
  node.removeAttribute("amplitude");
  node.removeAttribute("exponent");
  node.removeAttribute("offset");
  node.setAttribute("tableValues", d3d8GammaRampTableValues(ramp));
}

function applyD3D8GammaFilter(ramps, enabled) {
  if (!enabled) {
    canvas.style.filter = "";
    return "";
  }
  const nodes = ensureD3D8GammaFilterNodes();
  applyD3D8GammaTableFunction(nodes.red, ramps.red);
  applyD3D8GammaTableFunction(nodes.green, ramps.green);
  applyD3D8GammaTableFunction(nodes.blue, ramps.blue);
  const cssFilter = `url(#${D3D8_GAMMA_FILTER_ID})`;
  canvas.style.filter = cssFilter;
  return cssFilter;
}

function setD3D8GammaRamp(payload = {}) {
  const red = copyD3D8GammaRampChannel(payload.red);
  const green = copyD3D8GammaRampChannel(payload.green);
  const blue = copyD3D8GammaRampChannel(payload.blue);
  const channels = {
    red: estimateD3D8GammaChannel(red),
    green: estimateD3D8GammaChannel(green),
    blue: estimateD3D8GammaChannel(blue),
  };
  const applied = !d3d8GammaChannelIsIdentity(channels.red)
    || !d3d8GammaChannelIsIdentity(channels.green)
    || !d3d8GammaChannelIsIdentity(channels.blue);
  const cssFilter = applyD3D8GammaFilter({ red, green, blue }, applied);
  const summary = {
    source: "d3d8_gamma_ramp_presentation",
    supported: true,
    applied,
    filterMode: applied ? "table" : "identity",
    lutEntries: 256,
    flags: Number(payload.flags ?? 0) >>> 0,
    cssFilter,
    channels,
    samples: {
      red: sampleD3D8GammaRampChannel(red),
      green: sampleD3D8GammaRampChannel(green),
      blue: sampleD3D8GammaRampChannel(blue),
    },
    request: payload.request ?? null,
  };
  harnessState.graphics = {
    ...harnessState.graphics,
    d3d8Gamma: summary,
  };
  return summary;
}

// getBoundingClientRect() forces style/layout and is on the per-draw path via
// syncCanvasSize(), so the display size is cached and only recomputed when a
// size-affecting event fires (resize, fullscreen, dpr change, engine-display /
// backing-store updates below).
let cachedCanvasDisplaySize = null;
function invalidateCanvasDisplaySizeCache() {
  cachedCanvasDisplaySize = null;
}
if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("resize", invalidateCanvasDisplaySizeCache);
  document.addEventListener("fullscreenchange", invalidateCanvasDisplaySizeCache);
  document.addEventListener("webkitfullscreenchange", invalidateCanvasDisplaySizeCache);
  if (typeof ResizeObserver === "function" && canvas) {
    new ResizeObserver(invalidateCanvasDisplaySizeCache).observe(canvas);
  }
  const watchDevicePixelRatio = () => {
    try {
      const mql = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      mql.addEventListener("change", () => {
        invalidateCanvasDisplaySizeCache();
        watchDevicePixelRatio();
      }, { once: true });
    } catch (_error) {
      // matchMedia unavailable; resize events still invalidate.
    }
  };
  watchDevicePixelRatio();
}

function getCanvasDisplaySize() {
  if (cachedCanvasDisplaySize) {
    return cachedCanvasDisplaySize;
  }
  // OffscreenCanvas (worker realm) has no CSS box; fall back to the backing
  // store size. On the main thread these guards never trigger.
  const rect = typeof canvas.getBoundingClientRect === "function"
    ? canvas.getBoundingClientRect()
    : { width: canvas.width, height: canvas.height };
  const devicePixelRatio = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
  const cssWidth = rect.width || canvas.width;
  const cssHeight = rect.height || canvas.height;

  // Single sizing rule: once the engine device exists, the backing store is
  // PINNED to the engine render resolution (the D3D8 shim reports it via
  // onD3D8BackbufferResize on device create and every Reset), so the drawing
  // buffer always matches the render target 1:1 — no stretch, correct
  // unproject/pick-ray, identical in windowed and fullscreen (the CSS
  // `object-fit: contain` letterboxes it into whatever box the page gives
  // the canvas). cssWidth/cssHeight still report the real CSS box so
  // pointer->engine mapping and refreshCanvasState stay accurate. Pre-engine
  // pages (probes without the real device) fall through to CSS x DPR.
  if (explicitEngineBackingStore
      && explicitEngineBackingStore.width > 0
      && explicitEngineBackingStore.height > 0) {
    cachedCanvasDisplaySize = {
      width: explicitEngineBackingStore.width,
      height: explicitEngineBackingStore.height,
      cssWidth,
      cssHeight,
      devicePixelRatio,
    };
    return cachedCanvasDisplaySize;
  }

  cachedCanvasDisplaySize = {
    width: Math.max(1, Math.round(cssWidth * devicePixelRatio)),
    height: Math.max(1, Math.round(cssHeight * devicePixelRatio)),
    cssWidth,
    cssHeight,
    devicePixelRatio,
  };
  return cachedCanvasDisplaySize;
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
    // The ~150-field perf summary is too expensive to rebuild on the clear/draw
    // path in lite mode; snapshotState() force-refreshes it for RPC consumers.
    d3d8Perf: d3d8DiagLevel === "full"
      ? d3d8PerfSummary()
      : (previousGraphics.d3d8Perf ?? null),
  };
}

function syncCanvasSize(options = {}) {
  if (options.flushPending !== false) {
    flushD3D8PendingDrawBatch("syncCanvasSize");
  }
  const displaySize = getCanvasDisplaySize();
  const restoreViewport = options.restoreViewport !== false;
  const refreshState = options.refreshState !== false;
  let resized = false;
  if (canvas.width !== displaySize.width || canvas.height !== displaySize.height) {
    canvas.width = displaySize.width;
    canvas.height = displaySize.height;
    resized = true;
  }
  if (resized) {
    invalidateD3D8NormalizedViewportCache();
  }
  if (gl && restoreViewport) {
    restoreFullRenderTargetViewport();
  } else if (resized) {
    invalidateD3D8AppliedViewportCache();
  }
  if (refreshState || resized) {
    refreshCanvasState(displaySize);
  }
}

// The engine owns the render resolution. The D3D8 shim calls this on device
// create and on every device Reset (any TheDisplay->setDisplayMode — whether
// the page's setEngineResolution RPC or the in-game options screen drove it),
// making the engine backbuffer the single source of truth for the WebGL2
// backing store. Pin the store to it, resize the canvas, refresh the caches,
// and broadcast so the page UI can mirror engine-initiated changes.
function onD3D8BackbufferResize(width, height, source = "engine") {
  const bufferWidth = Math.round(Number(width) || 0);
  const bufferHeight = Math.round(Number(height) || 0);
  if (bufferWidth < 2 || bufferHeight < 2) {
    return;
  }
  // Flush draws batched against the OLD buffer before the size changes.
  flushD3D8PendingDrawBatch("backbufferResize");
  explicitEngineBackingStore = { width: bufferWidth, height: bufferHeight };
  harnessState.engineDisplaySize = { width: bufferWidth, height: bufferHeight };
  invalidateCanvasDisplaySizeCache();
  if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
    canvas.width = bufferWidth;
    canvas.height = bufferHeight;
  }
  invalidateD3D8NormalizedViewportCache();
  invalidateD3D8AppliedViewportCache();
  if (gl) {
    restoreFullRenderTargetViewport();
  }
  refreshCanvasState();
  recordLog("d3d8 backbuffer resize", { width: bufferWidth, height: bufferHeight, source });
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    try {
      window.dispatchEvent(new CustomEvent("cncport:resolutionchange", {
        detail: { width: bufferWidth, height: bufferHeight, source },
      }));
    } catch {
      // worker context without CustomEvent — state RPC still reflects the size
    }
  }
}

function releaseD3D8ProbeBackingStore() {
  flushD3D8PendingDrawBatch("releaseProbeBackingStore");
  explicitEngineBackingStore = null;
  harnessState.engineDisplaySize = null;
  invalidateCanvasDisplaySizeCache();
  syncCanvasSize();
  recordLog("d3d8 probe backing store released");
}

// Browser-native pixel size for the shim's adapter mode table (the size the
// canvas CSS box occupies x devicePixelRatio — rendering at it is 1:1 sharp).
function d3d8NativeModeQuery() {
  const rect = typeof canvas.getBoundingClientRect === "function"
    ? canvas.getBoundingClientRect()
    : { width: canvas.width, height: canvas.height };
  const dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
  const cssWidth = rect.width || canvas.width || 0;
  const cssHeight = rect.height || canvas.height || 0;
  return {
    width: Math.round(cssWidth * dpr),
    height: Math.round(cssHeight * dpr),
  };
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clampNumber(value, min, max, fallback) {
  return Math.max(min, Math.min(max, finiteNumber(value, fallback)));
}

function currentRenderSurfaceSize() {
  if (d3d8CurrentFramebuffer !== null &&
      d3d8CurrentFramebufferWidth > 0 && d3d8CurrentFramebufferHeight > 0) {
    return {
      width: d3d8CurrentFramebufferWidth,
      height: d3d8CurrentFramebufferHeight,
    };
  }
  return {
    width: gl ? gl.drawingBufferWidth : canvas.width,
    height: gl ? gl.drawingBufferHeight : canvas.height,
  };
}

function restoreFullRenderTargetViewport() {
  if (!gl) {
    return;
  }
  const target = currentRenderSurfaceSize();
  gl.viewport(0, 0, target.width, target.height);
  gl.disable(gl.SCISSOR_TEST);
  gl.depthRange(0, 1);
  invalidateD3D8AppliedViewportCache();
}

function normalizeD3D8Viewport(payload = {}, drawingBuffer = currentRenderSurfaceSize()) {
  const bufferWidth = Math.max(0, drawingBuffer.width);
  const bufferHeight = Math.max(0, drawingBuffer.height);
  const requested = {
    x: Math.trunc(finiteNumber(payload.x, 0)),
    y: Math.trunc(finiteNumber(payload.y, 0)),
    width: Math.trunc(finiteNumber(payload.width, bufferWidth)),
    height: Math.trunc(finiteNumber(payload.height, bufferHeight)),
    minZ: finiteNumber(payload.minZ, 0),
    maxZ: finiteNumber(payload.maxZ, 1),
    targetWidth: Math.trunc(finiteNumber(payload.targetWidth, payload.width ?? bufferWidth)),
    targetHeight: Math.trunc(finiteNumber(payload.targetHeight, payload.height ?? bufferHeight)),
  };
  const targetWidth = Math.max(1, requested.targetWidth);
  const targetHeight = Math.max(1, requested.targetHeight);
  const x = Math.max(0, Math.min(targetWidth, requested.x));
  const y = Math.max(0, Math.min(targetHeight, requested.y));
  const width = Math.max(0, Math.min(Math.max(0, requested.width), targetWidth - x));
  const height = Math.max(0, Math.min(Math.max(0, requested.height), targetHeight - y));
  const minZ = clampNumber(requested.minZ, 0, 1, 0);
  const maxZ = Math.max(minZ, clampNumber(requested.maxZ, 0, 1, 1));
  const d3d = { x, y, width, height, minZ, maxZ };
  const scaleX = bufferWidth / targetWidth;
  const scaleY = bufferHeight / targetHeight;
  const glX = Math.round(x * scaleX);
  const glTop = Math.round(y * scaleY);
  const glWidth = Math.round(width * scaleX);
  const glHeight = Math.round(height * scaleY);
  const glViewport = {
    x: glX,
    y: Math.max(0, bufferHeight - glTop - glHeight),
    width: glWidth,
    height: glHeight,
    minZ,
    maxZ,
  };
  const appliedKey = {
    x: glViewport.x,
    y: glViewport.y,
    width: glViewport.width,
    height: glViewport.height,
    minZ: glViewport.minZ,
    maxZ: glViewport.maxZ,
    drawingBufferWidth: bufferWidth,
    drawingBufferHeight: bufferHeight,
  };
  return {
    requested,
    d3d,
    gl: glViewport,
    appliedKey,
    renderTarget: {
      width: targetWidth,
      height: targetHeight,
      scaleX,
      scaleY,
    },
    drawingBuffer,
    clipped: requested.x !== x ||
      requested.y !== y ||
      requested.width !== width ||
      requested.height !== height ||
      requested.minZ !== minZ ||
      requested.maxZ !== maxZ,
  };
}

function currentD3D8ViewportPayload(drawingBuffer = currentRenderSurfaceSize()) {
  if (d3d8XrViewOverride) {
    return d3d8XrViewOverride.viewport;
  }
  if (d3d8ViewportState) {
    return d3d8ViewportState;
  }
  return {
    x: 0,
    y: 0,
    width: drawingBuffer.width,
    height: drawingBuffer.height,
    minZ: 0,
    maxZ: 1,
    targetWidth: drawingBuffer.width,
    targetHeight: drawingBuffer.height,
  };
}

function multiplyD3D8ColumnMatrices(left, right, target) {
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let value = 0;
      for (let inner = 0; inner < 4; inner += 1) {
        value += left[inner * 4 + row] * right[column * 4 + inner];
      }
      target[column * 4 + row] = value;
    }
  }
  return target;
}

function invertD3D8ColumnMatrix(matrix, target) {
  const a00 = matrix[0], a01 = matrix[1], a02 = matrix[2], a03 = matrix[3];
  const a10 = matrix[4], a11 = matrix[5], a12 = matrix[6], a13 = matrix[7];
  const a20 = matrix[8], a21 = matrix[9], a22 = matrix[10], a23 = matrix[11];
  const a30 = matrix[12], a31 = matrix[13], a32 = matrix[14], a33 = matrix[15];
  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;
  const determinant = b00 * b11 - b01 * b10 + b02 * b09
    + b03 * b08 - b04 * b07 + b05 * b06;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) return null;
  const inverseDeterminant = 1 / determinant;
  target[0] = (a11 * b11 - a12 * b10 + a13 * b09) * inverseDeterminant;
  target[1] = (a02 * b10 - a01 * b11 - a03 * b09) * inverseDeterminant;
  target[2] = (a31 * b05 - a32 * b04 + a33 * b03) * inverseDeterminant;
  target[3] = (a22 * b04 - a21 * b05 - a23 * b03) * inverseDeterminant;
  target[4] = (a12 * b08 - a10 * b11 - a13 * b07) * inverseDeterminant;
  target[5] = (a00 * b11 - a02 * b08 + a03 * b07) * inverseDeterminant;
  target[6] = (a32 * b02 - a30 * b05 - a33 * b01) * inverseDeterminant;
  target[7] = (a20 * b05 - a22 * b02 + a23 * b01) * inverseDeterminant;
  target[8] = (a10 * b10 - a11 * b08 + a13 * b06) * inverseDeterminant;
  target[9] = (a01 * b08 - a00 * b10 - a03 * b06) * inverseDeterminant;
  target[10] = (a30 * b04 - a31 * b02 + a33 * b00) * inverseDeterminant;
  target[11] = (a21 * b02 - a20 * b04 - a23 * b00) * inverseDeterminant;
  target[12] = (a11 * b07 - a10 * b09 - a12 * b06) * inverseDeterminant;
  target[13] = (a00 * b09 - a01 * b07 + a02 * b06) * inverseDeterminant;
  target[14] = (a31 * b01 - a30 * b03 - a32 * b00) * inverseDeterminant;
  target[15] = (a20 * b03 - a21 * b01 + a22 * b00) * inverseDeterminant;
  return target;
}

function computeD3D8XrClipTransform(engineView, engineProjection) {
  if (!d3d8XrViewOverride || !engineView || !engineProjection) return null;
  const engineViewProjection = multiplyD3D8ColumnMatrices(
    engineProjection,
    engineView,
    d3d8DrawMatrixScratch.xrEngineViewProjection,
  );
  const inverse = invertD3D8ColumnMatrix(
    engineViewProjection,
    d3d8DrawMatrixScratch.xrEngineViewProjectionInverse,
  );
  if (!inverse) return null;
  const xrViewProjection = multiplyD3D8ColumnMatrices(
    d3d8XrViewOverride.projection,
    multiplyD3D8ColumnMatrices(
      d3d8XrViewOverride.viewPrefix,
      engineView,
      d3d8DrawMatrixScratch.xrView,
    ),
    d3d8DrawMatrixScratch.xrViewProjection,
  );
  return multiplyD3D8ColumnMatrices(
    xrViewProjection,
    inverse,
    d3d8DrawMatrixScratch.xrClipTransform,
  );
}

function setD3D8XrViewOverride(override) {
  flushD3D8PendingDrawBatch("xrViewOverride");
  if (override === null) {
    d3d8XrViewOverride = null;
  } else {
    const viewPrefix = normalizeD3DMatrix(override?.viewPrefix);
    const projection = normalizeD3DMatrix(override?.projection);
    const viewport = override?.viewport;
    if (!viewPrefix || !projection || !viewport
        || !(Number(viewport.width) > 0) || !(Number(viewport.height) > 0)) {
      throw new TypeError("D3D8 WebXR view override requires matrices and a positive viewport");
    }
    d3d8XrViewOverride = {
      viewPrefix: new Float32Array(viewPrefix),
      projection: new Float32Array(projection),
      viewport: {
        x: Number(viewport.x) >>> 0,
        y: Number(viewport.y) >>> 0,
        width: Number(viewport.width) >>> 0,
        height: Number(viewport.height) >>> 0,
        minZ: 0,
        maxZ: 1,
        targetWidth: Number(override.targetWidth ?? viewport.width) >>> 0,
        targetHeight: Number(override.targetHeight ?? viewport.height) >>> 0,
      },
    };
  }
  invalidateD3D8NormalizedViewportCache();
  invalidateD3D8AppliedViewportCache();
  // The engine source matrices remain valid across eyes; only their uploaded
  // per-program values change when the compositor override changes.
  invalidateD3D8TransformUniformGeneration();
}

function bindD3D8ExternalFramebuffer(framebuffer, width, height) {
  if (!gl || !framebuffer || !(Number(width) > 0) || !(Number(height) > 0)) {
    throw new TypeError("D3D8 external framebuffer requires a GL framebuffer and size");
  }
  invalidateD3D8DrawStateCache();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  d3d8CurrentFramebuffer = framebuffer;
  d3d8CurrentFramebufferWidth = Number(width) >>> 0;
  d3d8CurrentFramebufferHeight = Number(height) >>> 0;
  d3d8CurrentFramebufferColorTextureId = 0;
  invalidateD3D8NormalizedViewportCache();
  invalidateD3D8AppliedViewportCache();
  return true;
}

function cachedD3D8NormalizedViewport() {
  const drawingBuffer = currentRenderSurfaceSize();
  const bufferWidth = Math.max(0, drawingBuffer.width);
  const bufferHeight = Math.max(0, drawingBuffer.height);
  const payload = currentD3D8ViewportPayload({ width: bufferWidth, height: bufferHeight });
  if (d3d8CachedNormalizedViewport &&
      d3d8ViewportInputMatches(d3d8CachedViewportInput, payload, bufferWidth, bufferHeight)) {
    return d3d8CachedNormalizedViewport;
  }
  const viewport = normalizeD3D8Viewport(payload, { width: bufferWidth, height: bufferHeight });
  d3d8CachedViewportInput = {
    x: payload.x,
    y: payload.y,
    width: payload.width,
    height: payload.height,
    minZ: payload.minZ,
    maxZ: payload.maxZ,
    targetWidth: payload.targetWidth,
    targetHeight: payload.targetHeight,
    bufferWidth,
    bufferHeight,
  };
  d3d8CachedNormalizedViewport = viewport;
  return viewport;
}

function viewportArraysEqual(left, right, tolerance = 0) {
  return Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((component, index) => Math.abs(component - right[index]) <= tolerance);
}

function applyD3D8Viewport(reason = "draw") {
  const viewport = cachedD3D8NormalizedViewport();
  d3d8ViewportStats.applications += 1;
  const viewportKey = viewport.appliedKey;
  if (!gl) {
    const probe = {
      ok: false,
      source: "browser_d3d8_viewport",
      api: harnessState.graphics?.api ?? "2d-fallback",
      reason,
      sets: d3d8ViewportStats.sets,
      applications: d3d8ViewportStats.applications,
      requested: viewport.requested,
      d3d: viewport.d3d,
      gl: viewport.gl,
      renderTarget: viewport.renderTarget,
      drawingBuffer: viewport.drawingBuffer,
      scissorEnabled: false,
    };
    harnessState.graphics = {
      ...harnessState.graphics,
      d3d8Viewport: probe,
    };
    return probe;
  }

  const cacheHit = d3d8ViewportAppliedKeyMatches(d3d8LastAppliedViewportKey, viewportKey);
  if (cacheHit) {
    if (d3d8PerfCountersEnabled) d3d8PerfStats.drawViewportCacheHits += 1;
  } else {
    if (d3d8PerfCountersEnabled) d3d8PerfStats.drawViewportCacheMisses += 1;
    gl.viewport(viewport.gl.x, viewport.gl.y, viewport.gl.width, viewport.gl.height);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(viewport.gl.x, viewport.gl.y, viewport.gl.width, viewport.gl.height);
    gl.depthRange(viewport.gl.minZ, viewport.gl.maxZ);
    d3d8LastAppliedViewportKey = viewportKey;
  }

  if (d3d8DiagLevel !== "full") {
    return {
      ok: true,
      source: "browser_d3d8_viewport",
      d3d: viewport.d3d,
      gl: viewport.gl,
      lite: true,
      cacheHit,
    };
  }

  const actualViewport = Array.from(gl.getParameter(gl.VIEWPORT));
  const actualScissor = Array.from(gl.getParameter(gl.SCISSOR_BOX));
  const actualDepthRange = Array.from(gl.getParameter(gl.DEPTH_RANGE));
  const expectedBox = [viewport.gl.x, viewport.gl.y, viewport.gl.width, viewport.gl.height];
  const expectedDepth = [viewport.gl.minZ, viewport.gl.maxZ];
  const scissorEnabled = gl.isEnabled(gl.SCISSOR_TEST);
  const probe = {
    ok: viewportArraysEqual(actualViewport, expectedBox) &&
      viewportArraysEqual(actualScissor, expectedBox) &&
      viewportArraysEqual(actualDepthRange, expectedDepth, 0.00001) &&
      scissorEnabled,
    source: "browser_d3d8_viewport",
    api: harnessState.graphics?.api ?? "webgl2",
    reason,
    sets: d3d8ViewportStats.sets,
    applications: d3d8ViewportStats.applications,
    cacheHit,
    requested: viewport.requested,
    d3d: viewport.d3d,
    gl: viewport.gl,
    renderTarget: viewport.renderTarget,
    actual: {
      viewport: actualViewport,
      scissor: actualScissor,
      depthRange: actualDepthRange,
    },
    drawingBuffer: viewport.drawingBuffer,
    clipped: viewport.clipped,
    scissorEnabled,
  };
  harnessState.graphics = {
    ...harnessState.graphics,
    d3d8Viewport: probe,
  };
  return probe;
}

function setD3D8Viewport(payload = {}) {
  d3d8ViewportStats.sets += 1;
  // A D3D SetViewport only affects viewport/scissor/depthRange — none of the
  // tracked blend/cull/stencil GL state, uniforms, or vertex attribs. The
  // renderUniform key stores viewport values and is compared against the
  // freshly applied viewport per draw, so invalidating only the viewport
  // caches keeps every other cache warm. (This used to nuke the entire draw
  // state cache, forcing a full GL-state + uniform re-upload on the first
  // draw after every SetViewport — dozens of times per frame.)
  flushD3D8PendingDrawBatch("setViewport");
  invalidateD3D8NormalizedViewportCache();
  d3d8ViewportState = {
    x: Number(payload.x ?? 0) >>> 0,
    y: Number(payload.y ?? 0) >>> 0,
    width: Number(payload.width ?? 0) >>> 0,
    height: Number(payload.height ?? 0) >>> 0,
    minZ: finiteNumber(payload.minZ, 0),
    maxZ: finiteNumber(payload.maxZ, 1),
    targetWidth: Number(payload.targetWidth ?? payload.width ?? 0) >>> 0,
    targetHeight: Number(payload.targetHeight ?? payload.height ?? 0) >>> 0,
  };
  return applyD3D8Viewport("set");
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

function bindD3D8Program(program) {
  if (!gl || d3d8CurrentProgram === program) {
    return;
  }
  gl.useProgram(program);
  d3d8CurrentProgram = program;
  d3d8LastVertexAttribKey = null;
  d3d8LastDefaultVertexAttribKey = null;
  resetD3D8UniformSubgroupCaches();
  harnessState.graphics.lastD3D8AppliedRenderState = null;
  harnessState.graphics.lastD3D8UniformKey = null;
  harnessState.graphics.lastD3D8TextureUniformKey = null;
}

function d3d8VertexArraySupported() {
  return Boolean(gl && typeof gl.createVertexArray === "function" && typeof gl.bindVertexArray === "function");
}

function setD3D8ScratchVertexAttribKey({
  vertexBufferId,
  vertexByteOffset,
  vertexStride,
  bridgeProgram,
  vertexLayout,
  canSampleTexture0,
  texture0Coordinates,
  canSampleTexture1,
  texture1Coordinates,
}) {
  d3d8ScratchVertexAttribKey.vertexBufferId = vertexBufferId;
  d3d8ScratchVertexAttribKey.vertexByteOffset = vertexByteOffset;
  d3d8ScratchVertexAttribKey.vertexStride = vertexStride;
  d3d8ScratchVertexAttribKey.positionAttrib = bridgeProgram.position;
  d3d8ScratchVertexAttribKey.normalAttrib = bridgeProgram.normal;
  d3d8ScratchVertexAttribKey.diffuseAttrib = bridgeProgram.diffuse;
  d3d8ScratchVertexAttribKey.specularAttrib = bridgeProgram.specular;
  d3d8ScratchVertexAttribKey.texCoord0Attrib = bridgeProgram.texCoord0;
  d3d8ScratchVertexAttribKey.texCoord1Attrib = bridgeProgram.texCoord1;
  d3d8ScratchVertexAttribKey.positionComponents = vertexLayout.positionComponents ?? 3;
  d3d8ScratchVertexAttribKey.pretransformed = vertexLayout.pretransformed ? 1 : 0;
  d3d8ScratchVertexAttribKey.normalOffset = vertexLayout.normalOffset ?? -1;
  d3d8ScratchVertexAttribKey.diffuseOffset = vertexLayout.diffuseOffset ?? -1;
  d3d8ScratchVertexAttribKey.specularOffset = vertexLayout.specularOffset ?? -1;
  d3d8ScratchVertexAttribKey.canSampleTexture0 = canSampleTexture0 ? 1 : 0;
  d3d8ScratchVertexAttribKey.texture0UsesVertexTexCoord = texture0Coordinates.usesVertexTexCoord ? 1 : 0;
  d3d8ScratchVertexAttribKey.texture0Offset = texture0Coordinates.offset ?? -1;
  d3d8ScratchVertexAttribKey.canSampleTexture1 = canSampleTexture1 ? 1 : 0;
  d3d8ScratchVertexAttribKey.texture1UsesVertexTexCoord = texture1Coordinates.usesVertexTexCoord ? 1 : 0;
  d3d8ScratchVertexAttribKey.texture1Offset = texture1Coordinates.offset ?? -1;
  return d3d8ScratchVertexAttribKey;
}

function cloneD3D8VertexAttribKey(key) {
  return {
    vertexBufferId: key.vertexBufferId,
    vertexByteOffset: key.vertexByteOffset,
    vertexStride: key.vertexStride,
    positionAttrib: key.positionAttrib,
    normalAttrib: key.normalAttrib,
    diffuseAttrib: key.diffuseAttrib,
    specularAttrib: key.specularAttrib,
    texCoord0Attrib: key.texCoord0Attrib,
    texCoord1Attrib: key.texCoord1Attrib,
    positionComponents: key.positionComponents,
    pretransformed: key.pretransformed,
    normalOffset: key.normalOffset,
    diffuseOffset: key.diffuseOffset,
    specularOffset: key.specularOffset,
    canSampleTexture0: key.canSampleTexture0,
    texture0UsesVertexTexCoord: key.texture0UsesVertexTexCoord,
    texture0Offset: key.texture0Offset,
    canSampleTexture1: key.canSampleTexture1,
    texture1UsesVertexTexCoord: key.texture1UsesVertexTexCoord,
    texture1Offset: key.texture1Offset,
  };
}

function d3d8VertexAttribKeyMatches(entry, key) {
  return entry !== null &&
    entry.vertexBufferId === key.vertexBufferId &&
    entry.vertexByteOffset === key.vertexByteOffset &&
    entry.vertexStride === key.vertexStride &&
    entry.positionAttrib === key.positionAttrib &&
    entry.normalAttrib === key.normalAttrib &&
    entry.diffuseAttrib === key.diffuseAttrib &&
    entry.specularAttrib === key.specularAttrib &&
    entry.texCoord0Attrib === key.texCoord0Attrib &&
    entry.texCoord1Attrib === key.texCoord1Attrib &&
    entry.positionComponents === key.positionComponents &&
    entry.pretransformed === key.pretransformed &&
    entry.normalOffset === key.normalOffset &&
    entry.diffuseOffset === key.diffuseOffset &&
    entry.specularOffset === key.specularOffset &&
    entry.canSampleTexture0 === key.canSampleTexture0 &&
    entry.texture0UsesVertexTexCoord === key.texture0UsesVertexTexCoord &&
    entry.texture0Offset === key.texture0Offset &&
    entry.canSampleTexture1 === key.canSampleTexture1 &&
    entry.texture1UsesVertexTexCoord === key.texture1UsesVertexTexCoord &&
    entry.texture1Offset === key.texture1Offset;
}

function d3d8VertexArrayKeyMatches(entry, key, indexBufferId) {
  return d3d8VertexAttribKeyMatches(entry, key) &&
    entry.indexBufferId === indexBufferId;
}

function d3d8VertexArrayCacheBucket(vertexBufferId, indexBufferId, create = false) {
  let byIndexBuffer = d3d8VertexArrayCache.get(vertexBufferId);
  if (!byIndexBuffer) {
    if (!create) {
      return null;
    }
    byIndexBuffer = new Map();
    d3d8VertexArrayCache.set(vertexBufferId, byIndexBuffer);
  }
  let bucket = byIndexBuffer.get(indexBufferId);
  if (!bucket) {
    if (!create) {
      return null;
    }
    bucket = [];
    byIndexBuffer.set(indexBufferId, bucket);
  }
  return bucket;
}

function touchD3D8VertexArrayCacheEntry(entry) {
  if (!entry || entry === d3d8VertexArrayCacheNewest) {
    return;
  }
  if (entry.lruPrevious) {
    entry.lruPrevious.lruNext = entry.lruNext;
  } else if (entry === d3d8VertexArrayCacheOldest) {
    d3d8VertexArrayCacheOldest = entry.lruNext;
  }
  if (entry.lruNext) {
    entry.lruNext.lruPrevious = entry.lruPrevious;
  }
  entry.lruPrevious = d3d8VertexArrayCacheNewest;
  entry.lruNext = null;
  if (d3d8VertexArrayCacheNewest) {
    d3d8VertexArrayCacheNewest.lruNext = entry;
  } else {
    d3d8VertexArrayCacheOldest = entry;
  }
  d3d8VertexArrayCacheNewest = entry;
}

function unlinkD3D8VertexArrayCacheEntry(entry) {
  if (!entry) {
    return;
  }
  if (entry.lruPrevious) {
    entry.lruPrevious.lruNext = entry.lruNext;
  } else if (entry === d3d8VertexArrayCacheOldest) {
    d3d8VertexArrayCacheOldest = entry.lruNext;
  }
  if (entry.lruNext) {
    entry.lruNext.lruPrevious = entry.lruPrevious;
  } else if (entry === d3d8VertexArrayCacheNewest) {
    d3d8VertexArrayCacheNewest = entry.lruPrevious;
  }
  entry.lruPrevious = null;
  entry.lruNext = null;
}

function findD3D8VertexArrayCacheEntry(key, indexBufferId) {
  const bucket = d3d8VertexArrayCacheBucket(key.vertexBufferId, indexBufferId, false);
  if (!bucket) {
    return null;
  }
  for (const entry of bucket) {
    if (d3d8VertexArrayKeyMatches(entry, key, indexBufferId)) {
      touchD3D8VertexArrayCacheEntry(entry);
      return entry;
    }
  }
  return null;
}

function deleteD3D8VertexArrayCacheEntry(entry) {
  if (!entry) {
    return;
  }
  if (entry.vertexArray === d3d8CurrentVertexArray) {
    bindD3D8DefaultVertexArray();
  }
  if (entry === d3d8CurrentVertexArrayKey) {
    d3d8CurrentVertexArrayKey = null;
  }
  if (entry === d3d8LastVertexAttribKey) {
    d3d8LastVertexAttribKey = null;
  }
  if (gl && entry.vertexArray && typeof gl.deleteVertexArray === "function") {
    gl.deleteVertexArray(entry.vertexArray);
  }
}

function removeD3D8VertexArrayCacheEntry(entry) {
  if (!entry) {
    return;
  }
  const byIndexBuffer = d3d8VertexArrayCache.get(entry.vertexBufferId);
  const bucket = byIndexBuffer?.get(entry.indexBufferId);
  const bucketIndex = bucket?.indexOf(entry) ?? -1;
  if (bucketIndex >= 0) {
    bucket.splice(bucketIndex, 1);
    if (bucket.length === 0) {
      byIndexBuffer.delete(entry.indexBufferId);
      if (byIndexBuffer.size === 0) {
        d3d8VertexArrayCache.delete(entry.vertexBufferId);
      }
    }
  }
  unlinkD3D8VertexArrayCacheEntry(entry);
  deleteD3D8VertexArrayCacheEntry(entry);
  d3d8VertexArrayCacheEntries = Math.max(0, d3d8VertexArrayCacheEntries - 1);
}

function invalidateD3D8VertexArrayCacheForBufferIds(bufferIds) {
  const ids = new Set();
  for (const bufferId of bufferIds) {
    const numericId = Number(bufferId) >>> 0;
    if (numericId !== 0) {
      ids.add(numericId);
    }
  }
  if (ids.size === 0) {
    return 0;
  }
  if (ids.has(d3d8LastVertexAttribKey?.vertexBufferId)) {
    d3d8LastVertexAttribKey = null;
  }
  if (d3d8VertexArrayCacheEntries === 0) {
    return 0;
  }
  const matches = new Set();
  // Vertex-buffer buckets are keyed directly by the binding id.
  for (const id of ids) {
    const byIndexBuffer = d3d8VertexArrayCache.get(id);
    if (!byIndexBuffer) {
      continue;
    }
    for (const bucket of byIndexBuffer.values()) {
      for (const entry of bucket) {
        matches.add(entry);
      }
    }
  }
  // Index-buffer buckets are nested once beneath each vertex-buffer id.
  for (const byIndexBuffer of d3d8VertexArrayCache.values()) {
    for (const id of ids) {
      const bucket = byIndexBuffer.get(id);
      if (!bucket) {
        continue;
      }
      for (const entry of bucket) {
        matches.add(entry);
      }
    }
  }
  for (const entry of matches) {
    removeD3D8VertexArrayCacheEntry(entry);
  }
  if (matches.size > 0) {
    d3d8VertexArrayCacheInvalidations += 1;
    d3d8VertexArrayCacheInvalidatedEntries += matches.size;
  }
  return matches.size;
}

function invalidateD3D8VertexArrayCacheForBufferId(bufferId) {
  return invalidateD3D8VertexArrayCacheForBufferIds([bufferId]);
}

function evictOldestD3D8VertexArrayCacheEntry() {
  const entry = d3d8VertexArrayCacheOldest;
  if (!entry) {
    return;
  }
  removeD3D8VertexArrayCacheEntry(entry);
  d3d8VertexArrayCacheEvictions += 1;
}

function bindD3D8VertexArray(vertexArray, vertexAttribKey = null, elementArrayBuffer = null, vertexArrayKey = null) {
  if (!d3d8VertexArraySupported()) {
    return;
  }
  if (d3d8CurrentVertexArray === vertexArray) {
    d3d8CurrentVertexArrayKey = vertexArrayKey;
    d3d8LastVertexAttribKey = vertexAttribKey;
    d3d8CurrentElementArrayBuffer = elementArrayBuffer;
    return;
  }
  gl.bindVertexArray(vertexArray);
  d3d8CurrentVertexArray = vertexArray;
  d3d8CurrentVertexArrayKey = vertexArrayKey;
  d3d8LastVertexAttribKey = vertexAttribKey;
  d3d8CurrentElementArrayBuffer = elementArrayBuffer;
}

function bindD3D8DefaultVertexArray() {
  if (d3d8CurrentVertexArray !== null) {
    bindD3D8VertexArray(null, null, null);
  }
}

function bindD3D8ArrayBuffer(buffer) {
  if (!gl || d3d8CurrentArrayBuffer === buffer) {
    return;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  d3d8CurrentArrayBuffer = buffer;
}

function bindD3D8ElementArrayBuffer(buffer) {
  bindD3D8DefaultVertexArray();
  if (!gl || d3d8CurrentElementArrayBuffer === buffer) {
    return;
  }
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer);
  d3d8CurrentElementArrayBuffer = buffer;
}

function bindD3D8ElementArrayBufferForVertexArray(buffer) {
  if (!gl || d3d8CurrentElementArrayBuffer === buffer) {
    return;
  }
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer);
  d3d8CurrentElementArrayBuffer = buffer;
}

function forgetD3D8BufferBinding(buffer, bindingId) {
  invalidateD3D8VertexArrayCacheForBufferId(bindingId);
  if (d3d8CurrentArrayBuffer === buffer) {
    d3d8CurrentArrayBuffer = null;
  }
  if (d3d8CurrentElementArrayBuffer === buffer) {
    d3d8CurrentElementArrayBuffer = null;
  }
  d3d8LastVertexAttribKey = null;
  d3d8LastDefaultVertexAttribKey = null;
}

function getD3D8TemporaryIndexBuffer(byteLength) {
  const requiredBytes = Number(byteLength ?? 0) >>> 0;
  if (!gl || requiredBytes === 0) {
    return null;
  }
  if (!d3d8TemporaryIndexBuffer) {
    d3d8TemporaryIndexBuffer = gl.createBuffer();
    d3d8TemporaryIndexBufferBytes = 0;
  }
  if (!d3d8TemporaryIndexBuffer) {
    return null;
  }
  bindD3D8ElementArrayBuffer(d3d8TemporaryIndexBuffer);
  if (requiredBytes > d3d8TemporaryIndexBufferBytes) {
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, requiredBytes, gl.STREAM_DRAW);
    d3d8TemporaryIndexBufferBytes = requiredBytes;
  }
  return d3d8TemporaryIndexBuffer;
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

function updateD3D8BufferSummary(force = false) {
  if (!force && d3d8DiagLevel !== "full") {
    // Runs per buffer create/update/release; deferred in lite mode the same
    // way as updateD3D8TextureSummary (snapshotState() force-refreshes).
    return;
  }
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
      uploadBytes: d3d8BufferStats.uploadBytes,
      updateMs: roundedPerfMs(d3d8BufferStats.updateMs),
      bufferSubDataMs: roundedPerfMs(d3d8BufferStats.bufferSubDataMs),
      mirrorBytes: d3d8BufferStats.mirrorBytes,
      mirrorMs: roundedPerfMs(d3d8BufferStats.mirrorMs),
      mirrorSkippedBytes: d3d8BufferStats.mirrorSkippedBytes,
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

function shouldMirrorD3D8Buffer(resource) {
  if (!resource) {
    return false;
  }
  if (d3d8DiagLevel === "full") {
    return true;
  }
  if (resource.kindName === "vertex") {
    return d3d8LiteVertexBufferMirrorsEnabled;
  }
  // Lite-mode rendering does not inspect normal vertex buffers. Keep index
  // mirrors so flat-shade/wireframe fallback paths can still build temporary
  // element arrays without falling out of the real render path.
  return resource.kindName === "index";
}

function createD3D8Buffer(payload = {}) {
  if (!gl) {
    return 0;
  }
  flushD3D8PendingDrawBatch("bufferCreate");
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
    forgetD3D8BufferBinding(existing.buffer, existing.bindingId);
    gl.deleteBuffer(existing.buffer);
  }

  const buffer = gl.createBuffer();
  if (target === gl.ARRAY_BUFFER) {
    bindD3D8ArrayBuffer(buffer);
  } else {
    bindD3D8ElementArrayBuffer(buffer);
  }
  gl.bufferData(target, byteSize, usageInfo.glUsage);
  const record = {
    id,
    kind,
    kindName: d3d8BufferKindName(kind),
    byteSize,
    target,
    buffer,
    bindingId: id,
    gpuReferenced: false,
    bytes: null,
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

// ── Dynamic-buffer append redirection ────────────────────────────────────
// The engine streams CPU-built geometry (skinned meshes, particles, UI)
// through shared D3DUSAGE_DYNAMIC ring buffers: DISCARD at wrap, NOOVERWRITE
// appends between, one lock per mesh, ~1000 locks/frame in unit-heavy
// scenes. GL has no NOOVERWRITE contract, so uploading an append into the
// shared GL buffer while earlier draws in the same frame still read it makes
// ANGLE's Metal backend end the current render encoder (staging blit or
// whole-buffer copy) — a full tile load/store per append. Measured on the
// campaign intro: ~950 appends/frame pinned the crush at 3.4fps while a
// fresh-storage-per-append experiment ran the same scene at 60fps.
//
// Fix: never upload dynamic appends into the shared GL buffer. Each append
// is recorded as a range over the CPU mirror; the first draw that references
// a range uploads it once into a small dedicated pool buffer (bufferData
// full-replace → fresh ANGLE storage, no in-flight sync, no encoder break)
// and the draw binds that pool buffer with offset adjusted by the range
// start. Ranges are immutable until the next DISCARD recycles their pool
// slots, so multi-pass re-draws and out-of-order references stay correct.
const D3D8_DYNAMIC_RANGE_BUFFER_ID_BASE = 0x40000000;
const D3D8_RENAMED_BUFFER_ID_BASE = 0x20000000;
// Heavy scenes issue roughly 1,000 streaming appends per target in a frame.
// Keep two frames of reusable headroom, but release larger one-off backlogs
// instead of retaining their peak WebGLBuffer/VAO footprint forever.
const D3D8_DYNAMIC_RANGE_POOL_LIMIT_PER_TARGET = 2048;
// One pool per GL target: a WebGL buffer object is permanently typed by its
// first bind target, so vertex and element slots must never mix.
const d3d8DynamicRangeSlotPools = new Map();
const d3d8BufferRetirements = [];
const D3D8_RETIREMENTS_BEFORE_FLUSH = 32;
let d3d8DynamicRangeSlotCounter = 0;
let d3d8DynamicRangeSlotsDeleted = 0;
let d3d8RenamedBufferCounter = 0;
let d3d8RetirementsSinceFlush = 0;

function deleteD3D8DynamicRangeSlots(slots) {
  if (!gl) {
    return;
  }
  const liveSlots = slots.filter((slot) => slot?.buffer);
  invalidateD3D8VertexArrayCacheForBufferIds(liveSlots.map((slot) => slot.id));
  for (const slot of liveSlots) {
    if (d3d8CurrentArrayBuffer === slot.buffer) {
      d3d8CurrentArrayBuffer = null;
    }
    if (d3d8CurrentElementArrayBuffer === slot.buffer) {
      d3d8CurrentElementArrayBuffer = null;
    }
    gl.deleteBuffer(slot.buffer);
    slot.buffer = null;
    d3d8DynamicRangeSlotsDeleted += 1;
  }
}

function drainD3D8BufferRetirements() {
  if (!gl || typeof gl.clientWaitSync !== "function") {
    return;
  }
  let completed = 0;
  while (completed < d3d8BufferRetirements.length) {
    const retirement = d3d8BufferRetirements[completed];
    const status = gl.clientWaitSync(retirement.sync, 0, 0);
    if (status !== gl.ALREADY_SIGNALED && status !== gl.CONDITION_SATISFIED &&
        status !== gl.WAIT_FAILED) {
      // Syncs are inserted into one GL command stream. If the oldest pending
      // fence has not completed, no newer one can have completed either.
      break;
    }
    gl.deleteSync(retirement.sync);
    if (status === gl.WAIT_FAILED) {
      deleteD3D8DynamicRangeSlots(retirement.slots);
    } else {
      const excessSlots = [];
      for (const slot of retirement.slots) {
        let pool = d3d8DynamicRangeSlotPools.get(slot.target);
        if (!pool) {
          pool = [];
          d3d8DynamicRangeSlotPools.set(slot.target, pool);
        }
        if (pool.length < D3D8_DYNAMIC_RANGE_POOL_LIMIT_PER_TARGET) {
          pool.push(slot);
        } else {
          excessSlots.push(slot);
        }
      }
      deleteD3D8DynamicRangeSlots(excessSlots);
    }
    completed += 1;
  }
  if (completed > 0) {
    d3d8BufferRetirements.splice(0, completed);
  }
}

function retireD3D8BufferSlots(slots = []) {
  const liveSlots = slots.filter((slot) => slot?.buffer);
  if (liveSlots.length === 0) {
    return;
  }
  if (typeof gl.fenceSync === "function" && typeof gl.clientWaitSync === "function" &&
      typeof gl.deleteSync === "function") {
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    if (sync) {
      d3d8BufferRetirements.push({ sync, slots: liveSlots });
      d3d8RetirementsSinceFlush += 1;
      // A long batched engine RPC can keep JavaScript on one task for minutes,
      // so the browser may not submit these fences at a normal task boundary.
      // Periodically flush (without waiting) to keep the retirement queue and
      // its buffer storage bounded during those soaks.
      if (d3d8RetirementsSinceFlush >= D3D8_RETIREMENTS_BEFORE_FLUSH &&
          typeof gl.flush === "function") {
        gl.flush();
        d3d8RetirementsSinceFlush = 0;
      }
      return;
    }
  }
  // WebGL2 always provides sync objects, but keep context-loss/test doubles
  // safe: deleting an in-flight object is deferred by GL, while reusing it is
  // not safe without a completion signal.
  deleteD3D8DynamicRangeSlots(liveSlots);
}

function acquireD3D8DynamicRangeSlot(target) {
  drainD3D8BufferRetirements();
  let pool = d3d8DynamicRangeSlotPools.get(target);
  if (!pool) {
    pool = [];
    d3d8DynamicRangeSlotPools.set(target, pool);
  }
  const pooled = pool.pop();
  if (pooled) {
    return pooled;
  }
  const buffer = gl.createBuffer();
  if (!buffer) {
    return null;
  }
  d3d8DynamicRangeSlotCounter += 1;
  return {
    buffer,
    target,
    id: D3D8_DYNAMIC_RANGE_BUFFER_ID_BASE + d3d8DynamicRangeSlotCounter,
  };
}

function takeD3D8DynamicRangeSlots(ranges) {
  const slots = [];
  for (const range of ranges) {
    if (range?.slot) {
      slots.push(range.slot);
      range.slot = null;
    }
  }
  return slots;
}

function replaceD3D8BufferStorage(resource) {
  drainD3D8BufferRetirements();
  const buffer = gl.createBuffer();
  if (!buffer) {
    return false;
  }
  const previousBuffer = resource.buffer;
  const previousBindingId = resource.bindingId ?? resource.id;
  if (resource.target === gl.ELEMENT_ARRAY_BUFFER) {
    bindD3D8DefaultVertexArray();
    bindD3D8ElementArrayBuffer(buffer);
  } else {
    bindD3D8ArrayBuffer(buffer);
  }
  d3d8RenamedBufferCounter += 1;
  resource.buffer = buffer;
  resource.bindingId = D3D8_RENAMED_BUFFER_ID_BASE + d3d8RenamedBufferCounter;
  resource.gpuReferenced = false;
  // This object is never reused. Drop VAOs that retain it before deletion;
  // otherwise WebGL keeps the old storage alive until unrelated LRU pressure
  // eventually evicts those VAOs.
  invalidateD3D8VertexArrayCacheForBufferId(previousBindingId);
  gl.deleteBuffer(previousBuffer);
  return true;
}

function uploadD3D8DynamicSlot(resource, slot, bytes) {
  if (resource.target === gl.ELEMENT_ARRAY_BUFFER) {
    // Element bindings live in the VAO: park on the default vertex array so
    // the upload cannot clobber a cached VAO's element buffer.
    bindD3D8DefaultVertexArray();
    bindD3D8ElementArrayBuffer(slot.buffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, bytes, gl.STREAM_DRAW);
  } else {
    bindD3D8ArrayBuffer(slot.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, bytes, gl.STREAM_DRAW);
  }
}

function noteD3D8DynamicBufferUpdate(resource, start, byteLength, discard) {
  let ranges = resource.dynRanges;
  if (!Array.isArray(ranges)) {
    ranges = resource.dynRanges = [];
  }
  let mergedStart = start;
  let mergedEnd = start + byteLength;
  const retiredSlots = [];
  if (resource.dynSharedSlot) {
    retiredSlots.push(resource.dynSharedSlot);
    resource.dynSharedSlot = null;
  }
  if (discard) {
    retiredSlots.push(...takeD3D8DynamicRangeSlots(ranges));
    ranges.length = 0;
  } else {
    for (let i = ranges.length - 1; i >= 0; i -= 1) {
      const range = ranges[i];
      const overlaps = range.start < mergedEnd && mergedStart < range.end;
      // Coalesce adjacent writes only before either range has reached the GPU.
      // Streaming append ranges are update/draw interleaved; merging an
      // already-uploaded append would repeatedly re-upload the entire ring.
      const unuploadedAdjacent = range.slot == null &&
        (range.end === mergedStart || range.start === mergedEnd);
      if (overlaps || unuploadedAdjacent) {
        mergedStart = Math.min(mergedStart, range.start);
        mergedEnd = Math.max(mergedEnd, range.end);
        retiredSlots.push(...takeD3D8DynamicRangeSlots([range]));
        ranges.splice(i, 1);
      }
    }
  }
  ranges.push({ start: mergedStart, end: mergedEnd, slot: null });
  retireD3D8BufferSlots(retiredSlots);
}

function findD3D8DynamicRange(resource, byteOffset) {
  const ranges = resource.dynRanges;
  if (!Array.isArray(ranges)) {
    return null;
  }
  for (let i = ranges.length - 1; i >= 0; i -= 1) {
    const range = ranges[i];
    if (byteOffset >= range.start && byteOffset < range.end) {
      return range;
    }
  }
  return null;
}

function ensureD3D8DynamicRangeUploaded(resource, range) {
  if (range.slot) {
    return range.slot;
  }
  if (!(resource.bytes instanceof Uint8Array) || range.end > resource.bytes.byteLength) {
    return null;
  }
  const slot = acquireD3D8DynamicRangeSlot(resource.target);
  if (!slot) {
    return null;
  }
  const bytes = resource.bytes.subarray(range.start, range.end);
  uploadD3D8DynamicSlot(resource, slot, bytes);
  if (d3d8PerfCountersEnabled) d3d8PerfStats.bufferDynamicRangeUploads += 1;
  if (d3d8PerfCountersEnabled) d3d8PerfStats.bufferDynamicRangeUploadBytes += bytes.byteLength;
  range.slot = slot;
  return slot;
}

// Fallback for draws whose vertex/index window is not contained in a single
// recorded range (buffers filled by several partial updates and drawn across
// them — terrain chunks, atlases). Upload the whole mirror into its own pooled
// slot once per change. The logical resource's backing store may still be in
// flight, so mutating it here would reintroduce the sync this path avoids.
function ensureD3D8DynamicSharedBufferCurrent(resource) {
  if (resource.dynSharedSlot) {
    return resource.dynSharedSlot;
  }
  if (!(resource.bytes instanceof Uint8Array)) {
    return null;
  }
  const slot = acquireD3D8DynamicRangeSlot(resource.target);
  if (!slot) {
    return null;
  }
  uploadD3D8DynamicSlot(
    resource,
    slot,
    resource.bytes.subarray(0, Math.min(resource.byteSize, resource.bytes.byteLength)),
  );
  resource.dynSharedSlot = slot;
  if (d3d8PerfCountersEnabled) d3d8PerfStats.bufferDynamicRedirectFallbacks += 1;
  return slot;
}

function updateD3D8Buffer(payload = {}) {
  if (!gl || !(payload.bytes instanceof Uint8Array)) {
    return 0;
  }
  const updateStartedAt = perfNow();
  flushD3D8PendingDrawBatch("bufferUpdate");
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

  // Dynamic buffers that follow the streaming ring pattern (DISCARD at wrap,
  // NOOVERWRITE appends between — the per-mesh lock/draw stream that caused
  // the per-append ANGLE Metal pass breaks) are redirected: appends stay in
  // the CPU mirror and reach the GPU as per-range pool buffers at draw time.
  // Dynamic buffers filled with PLAIN locks (roads, other build-once
  // geometry) are NOT redirected: their draws may use conservative
  // minVertexIndex/vertexCount windows that exceed the locked range, which is
  // harmless against a full-size buffer but out-of-bounds against an
  // exact-size pool slot (WebGL then drops or zeroes the draw). Those buffers
  // take the cached whole-mirror refresh path instead (one fresh-storage
  // bufferData per actual change — still no per-draw in-flight sync).
  const discard = Boolean(resource.dynamic && (lockFlags & D3DLOCK_DISCARD));
  if (resource.dynamic === true &&
      (lockFlags & (D3DLOCK_DISCARD | D3DLOCK_NOOVERWRITE)) !== 0) {
    resource.dynRingPattern = true;
  }
  const dynamicRedirect = resource.dynamic === true && resource.dynRingPattern === true;
  let resized = false;
  let orphaned = false;
  if (dynamicRedirect) {
    if (requiredByteSize > resource.byteSize) {
      resource.byteSize = requiredByteSize;
      resized = true;
    }
  } else {
    if (requiredByteSize > resource.byteSize) {
      resource.byteSize = requiredByteSize;
      resized = true;
    }
    // D3D8 drivers rename storage behind a full/default-pool Lock when the
    // previous contents are still referenced by queued draws. WebGL does not:
    // bufferSubData on that live object can synchronously wait for the GPU.
    // Give whole replacements (and dynamic start-at-zero rewrites) a new GL
    // object instead. GL defers deletion of the old object's in-flight store,
    // and the new binding ID keeps cached VAOs from referring to stale data.
    const canReplaceWholeStorage = byteOffset === 0 &&
      (resource.dynamic === true || bytes.byteLength >= resource.byteSize);
    if (resource.gpuReferenced === true && (resized || canReplaceWholeStorage)) {
      orphaned = replaceD3D8BufferStorage(resource);
    }
    if (resource.target === gl.ARRAY_BUFFER) {
      bindD3D8ArrayBuffer(resource.buffer);
    } else {
      bindD3D8ElementArrayBuffer(resource.buffer);
    }
    if (resized && !orphaned) {
      gl.bufferData(resource.target, resource.byteSize, resource.glUsage);
    }
  }
  const mirrorStartedAt = perfNow();
  let mirroredBytes = 0;
  let skippedMirrorBytes = 0;
  if (dynamicRedirect || shouldMirrorD3D8Buffer(resource)) {
    if (!(resource.bytes instanceof Uint8Array)) {
      resource.bytes = new Uint8Array(resource.byteSize);
    } else if (resource.bytes.byteLength < resource.byteSize) {
      const mirror = new Uint8Array(resource.byteSize);
      mirror.set(resource.bytes.subarray(0, Math.min(resource.bytes.byteLength, mirror.byteLength)));
      resource.bytes = mirror;
    }
    if (discard) {
      resource.bytes.fill(0);
      mirroredBytes += resource.byteSize;
    }
    resource.bytes.set(bytes, byteOffset);
    mirroredBytes += bytes.byteLength;
  } else {
    resource.bytes = null;
    skippedMirrorBytes += bytes.byteLength + (discard ? resource.byteSize : 0);
  }
  const mirrorMs = perfNow() - mirrorStartedAt;
  let subDataMs = 0;
  if (dynamicRedirect) {
    noteD3D8DynamicBufferUpdate(resource, byteOffset, bytes.byteLength, discard);
    if (d3d8PerfCountersEnabled) d3d8PerfStats.bufferDynamicRedirectedUpdates += 1;
  } else if (orphaned && byteOffset === 0 && bytes.byteLength === resource.byteSize) {
    gl.bufferData(resource.target, bytes, resource.glUsage);
  } else {
    const subDataStartedAt = perfNow();
    if (orphaned) {
      gl.bufferData(resource.target, resource.byteSize, resource.glUsage);
    }
    gl.bufferSubData(resource.target, byteOffset, bytes);
    subDataMs = perfNow() - subDataStartedAt;
  }
  const updateMs = perfNow() - updateStartedAt;
  const noOverwrite = Boolean(lockFlags & D3DLOCK_NOOVERWRITE);
  resource.uploads += 1;
  d3d8BufferStats.updates += 1;
  d3d8BufferStats.uploadBytes += bytes.byteLength;
  d3d8BufferStats.updateMs += updateMs;
  d3d8BufferStats.bufferSubDataMs += subDataMs;
  d3d8BufferStats.mirrorBytes += mirroredBytes;
  d3d8BufferStats.mirrorMs += mirrorMs;
  d3d8BufferStats.mirrorSkippedBytes += skippedMirrorBytes;
  if (d3d8PerfCountersEnabled) d3d8PerfStats.bufferUpdates += 1;
  if (d3d8PerfCountersEnabled) d3d8PerfStats.bufferUploadBytes += bytes.byteLength;
  if (resource.kindName === "vertex") {
    if (d3d8PerfCountersEnabled) d3d8PerfStats.bufferVertexUpdates += 1;
    if (d3d8PerfCountersEnabled) d3d8PerfStats.bufferVertexUploadBytes += bytes.byteLength;
  } else if (resource.kindName === "index") {
    if (d3d8PerfCountersEnabled) d3d8PerfStats.bufferIndexUpdates += 1;
    if (d3d8PerfCountersEnabled) d3d8PerfStats.bufferIndexUploadBytes += bytes.byteLength;
  }
  if (resource.dynamic) {
    if (d3d8PerfCountersEnabled) d3d8PerfStats.bufferDynamicUpdates += 1;
    if (d3d8PerfCountersEnabled) d3d8PerfStats.bufferDynamicUploadBytes += bytes.byteLength;
  }
  if (discard) {
    if (d3d8PerfCountersEnabled) d3d8PerfStats.bufferDiscardUpdates += 1;
    if (d3d8PerfCountersEnabled) d3d8PerfStats.bufferDiscardUploadBytes += bytes.byteLength;
  }
  if (noOverwrite) {
    if (d3d8PerfCountersEnabled) d3d8PerfStats.bufferNoOverwriteUpdates += 1;
    if (d3d8PerfCountersEnabled) d3d8PerfStats.bufferNoOverwriteUploadBytes += bytes.byteLength;
  }
  if (orphaned) {
    if (d3d8PerfCountersEnabled) d3d8PerfStats.bufferOrphanedUpdates += 1;
  }
  if (resized) {
    if (d3d8PerfCountersEnabled) d3d8PerfStats.bufferResizedUpdates += 1;
  }
  if (d3d8PerfCountersEnabled) d3d8PerfStats.bufferUpdateMs += updateMs;
  if (d3d8PerfCountersEnabled) d3d8PerfStats.bufferSubDataMs += subDataMs;
  if (d3d8PerfCountersEnabled) d3d8PerfStats.bufferMirrorBytes += mirroredBytes;
  if (d3d8PerfCountersEnabled) d3d8PerfStats.bufferMirrorMs += mirrorMs;
  if (d3d8PerfCountersEnabled) d3d8PerfStats.bufferMirrorSkippedBytes += skippedMirrorBytes;
  const producer = d3d8BufferProducerTrackingEnabled ? bufferProducerLabel(payload.producer) : "";
  if (d3d8BufferProducerTrackingEnabled) {
    noteD3D8BufferProducerUpdate({
      producer,
      resource,
      byteLength: bytes.byteLength,
      updateMs,
      subDataMs,
      mirrorMs,
      mirroredBytes,
      skippedMirrorBytes,
      discard,
      noOverwrite,
      orphaned,
      resized,
    });
  }
  d3d8BufferStats.lastUpdate = {
    id,
    kind: resource.kindName,
    byteOffset,
    byteSize: bytes.byteLength,
    d3dUsage: resource.d3dUsage,
    glUsage: resource.glUsageName,
    lockFlags,
    discard: Boolean(lockFlags & D3DLOCK_DISCARD),
    noOverwrite,
    dynamicRedirected: dynamicRedirect,
    orphaned,
    resized,
    mirrored: mirroredBytes > 0,
    mirrorBytes: mirroredBytes,
    mirrorSkippedBytes: skippedMirrorBytes,
    mirrorMs: roundedPerfMs(mirrorMs),
    bufferSubDataMs: roundedPerfMs(subDataMs),
    updateMs: roundedPerfMs(updateMs),
    uploads: resource.uploads,
    producer: d3d8BufferProducerTrackingEnabled ? producer : null,
  };
  updateD3D8BufferSummary();
  return 1;
}

function releaseD3D8Buffer(payload = {}) {
  if (!gl) {
    return 0;
  }
  flushD3D8PendingDrawBatch("bufferRelease");
  const kind = Number(payload.kind ?? 0) >>> 0;
  const id = Number(payload.id ?? 0) >>> 0;
  const key = d3d8BufferKey(kind, id);
  const resource = d3d8Buffers.get(key);
  if (!resource) {
    return 0;
  }
  forgetD3D8BufferBinding(resource.buffer, resource.bindingId);
  gl.deleteBuffer(resource.buffer);
  if (Array.isArray(resource.dynRanges)) {
    const retiredSlots = takeD3D8DynamicRangeSlots(resource.dynRanges);
    if (resource.dynSharedSlot) {
      retiredSlots.push(resource.dynSharedSlot);
      resource.dynSharedSlot = null;
    }
    retireD3D8BufferSlots(retiredSlots);
    resource.dynRanges.length = 0;
  }
  d3d8Buffers.delete(key);
  d3d8BufferStats.releases += 1;
  d3d8BufferStats.lastRelease = { id, kind: resource.kindName };
  updateD3D8BufferSummary();
  return 1;
}

function d3d8TextureLevelSize(resource, level) {
  let width = resource.width;
  let height = resource.height;
  let depth = resource.depth ?? 1;
  for (let index = 0; index < level; ++index) {
    width = Math.max(1, width >> 1);
    height = Math.max(1, height >> 1);
    depth = Math.max(1, depth >> 1);
  }
  return { width, height, depth };
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
    case D3DFMT_V8U8:
      // D3D8 V8U8 is laid out as little-endian U,V signed two's-complement
      // bytes. WebGL2's ordinary RG8 sampling is unsigned, so bias each byte
      // into monotonic UNORM storage before upload and reconstruct the signed
      // vector in d3dTextureSample(). Keeping the bias in the texture preserves
      // bilinear filtering across the signed zero crossing.
      return {
        d3dFormat,
        supported: true,
        internalFormat: gl.RG8,
        format: gl.RG,
        type: gl.UNSIGNED_BYTE,
        storage: "rg8-v8u8",
        semantic: "signedBump",
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
        supported: true,
        compressed: false,
        internalFormat: gl.RGBA8,
        format: gl.RGBA,
        type: gl.UNSIGNED_BYTE,
        storage: "rgba8",
        dxtDecode: "DXT1",
        blockBytes: 8,
      };
    case D3DFMT_DXT2:
      return s3tc ? {
        d3dFormat,
        supported: true,
        compressed: true,
        internalFormat: s3tc.COMPRESSED_RGBA_S3TC_DXT3_EXT,
        format: 0,
        type: 0,
        storage: "dxt2",
        aliasedStorage: "dxt3",
        premultipliedAlpha: true,
        blockBytes: 16,
      } : {
        d3dFormat,
        supported: true,
        compressed: false,
        internalFormat: gl.RGBA8,
        format: gl.RGBA,
        type: gl.UNSIGNED_BYTE,
        storage: "rgba8",
        dxtDecode: "DXT3",
        blockBytes: 16,
        premultipliedAlpha: true,
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
        supported: true,
        compressed: false,
        internalFormat: gl.RGBA8,
        format: gl.RGBA,
        type: gl.UNSIGNED_BYTE,
        storage: "rgba8",
        dxtDecode: "DXT3",
        blockBytes: 16,
      };
    case D3DFMT_DXT4:
      return s3tc ? {
        d3dFormat,
        supported: true,
        compressed: true,
        internalFormat: s3tc.COMPRESSED_RGBA_S3TC_DXT5_EXT,
        format: 0,
        type: 0,
        storage: "dxt4",
        aliasedStorage: "dxt5",
        premultipliedAlpha: true,
        blockBytes: 16,
      } : {
        d3dFormat,
        supported: true,
        compressed: false,
        internalFormat: gl.RGBA8,
        format: gl.RGBA,
        type: gl.UNSIGNED_BYTE,
        storage: "rgba8",
        dxtDecode: "DXT5",
        blockBytes: 16,
        premultipliedAlpha: true,
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
        supported: true,
        compressed: false,
        internalFormat: gl.RGBA8,
        format: gl.RGBA,
        type: gl.UNSIGNED_BYTE,
        storage: "rgba8",
        dxtDecode: "DXT5",
        blockBytes: 16,
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

function d3d8DepthStencilFormatInfo(format) {
  const d3dFormat = Number(format ?? 0) >>> 0;
  switch (d3dFormat) {
    case D3DFMT_D16_LOCKABLE:
    case D3DFMT_D16:
      return {
        d3dFormat,
        supported: true,
        internalFormat: gl.DEPTH_COMPONENT16,
        format: gl.DEPTH_COMPONENT,
        type: gl.UNSIGNED_SHORT,
        attachment: gl.DEPTH_ATTACHMENT,
        storage: "depth16",
      };
    case D3DFMT_D24X8:
      return {
        d3dFormat,
        supported: true,
        internalFormat: gl.DEPTH_COMPONENT24,
        format: gl.DEPTH_COMPONENT,
        type: gl.UNSIGNED_INT,
        attachment: gl.DEPTH_ATTACHMENT,
        storage: "depth24",
      };
    case D3DFMT_D24S8:
      return {
        d3dFormat,
        supported: true,
        internalFormat: gl.DEPTH24_STENCIL8,
        format: gl.DEPTH_STENCIL,
        type: gl.UNSIGNED_INT_24_8,
        attachment: gl.DEPTH_STENCIL_ATTACHMENT,
        storage: "depth24-stencil8",
      };
    case D3DFMT_D15S1:
    case D3DFMT_D24X4S4:
    case D3DFMT_D32:
    default:
      return {
        d3dFormat,
        supported: false,
        reason: "depth/stencil format is not implemented by the WebGL2 FBO bridge",
      };
  }
}

function isD3D8DepthStencilTexture(resource) {
  return Boolean(resource) && (Number(resource.usage ?? 0) & D3DUSAGE_DEPTHSTENCIL) !== 0;
}

function convertD3D8TextureBytes(format, bytes, width, height, depth = 1) {
  const d3dFormat = Number(format ?? 0) >>> 0;
  const pixelCount = width * height * depth;
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
  if (d3dFormat === D3DFMT_V8U8) {
    const output = new Uint8Array(pixelCount * 2);
    for (let channel = 0; channel < output.length; ++channel) {
      // Reinterpret the source byte as int8, then bias [-128, 127] to
      // [0, 255]. The fragment shader performs the inverse normalization.
      output[channel] = (bytes[channel] + 128) & 0xff;
    }
    return output;
  }
  return bytes;
}

// DXT/BCn block decoders - CPU fallback when WEBGL_compressed_texture_s3tc unavailable
// Reference: Wine wined3d/utils.c:440, standard DXT spec

function dxtFourColorPalette(blockBytes) {
  const c0 = blockBytes[0] | (blockBytes[1] << 8);
  const c1 = blockBytes[2] | (blockBytes[3] << 8);
  const r0 = scale5((c0 >> 11) & 0x1F);
  const g0 = scale6((c0 >> 5) & 0x3F);
  const b0 = scale5(c0 & 0x1F);
  const r1 = scale5((c1 >> 11) & 0x1F);
  const g1 = scale6((c1 >> 5) & 0x3F);
  const b1 = scale5(c1 & 0x1F);
  return [
    { r: r0, g: g0, b: b0 },
    { r: r1, g: g1, b: b1 },
    { r: Math.round((2 * r0 + r1) / 3),
      g: Math.round((2 * g0 + g1) / 3),
      b: Math.round((2 * b0 + b1) / 3) },
    { r: Math.round((r0 + 2 * r1) / 3),
      g: Math.round((g0 + 2 * g1) / 3),
      b: Math.round((b0 + 2 * b1) / 3) },
  ];
}

/**
 * Decode a single DXT1 (BC1) block to 4x4 RGBA8
 * DXT1: 8 bytes -> 4x4 pixels. Two RGB565 endpoints + 4-color palette + 16×2-bit indices
 */
function decodeDxt1Block(blockBytes, target, width, height, x, y) {
  const c0 = (blockBytes[0] | (blockBytes[1] << 8));
  const c1 = (blockBytes[2] | (blockBytes[3] << 8));

  // Extract RGB565 components
  const r0 = scale5((c0 >> 11) & 0x1F);
  const g0 = scale6((c0 >> 5) & 0x3F);
  const b0 = scale5(c0 & 0x1F);

  const r1 = scale5((c1 >> 11) & 0x1F);
  const g1 = scale6((c1 >> 5) & 0x3F);
  const b1 = scale5(c1 & 0x1F);

  // Generate color palette per BC1 spec:
  // c0 > c1: 4-color mode: [c0, c1, (2*c0 + c1)/3, (c0 + 2*c1)/3]
  // c0 <= c1: 3-color + transparent mode: [c0, c1, (c0 + c1)/2, transparent black]
  const colors = [
    { r: r0, g: g0, b: b0, a: 255 },
    { r: r1, g: g1, b: b1, a: 255 },
    { r: c0 > c1 ? Math.round((2 * r0 + r1) / 3) : Math.round((r0 + r1) / 2),
      g: c0 > c1 ? Math.round((2 * g0 + g1) / 3) : Math.round((g0 + g1) / 2),
      b: c0 > c1 ? Math.round((2 * b0 + b1) / 3) : Math.round((b0 + b1) / 2),
      a: 255 },
    { r: c0 > c1 ? Math.round((r0 + 2 * r1) / 3) : 0,
      g: c0 > c1 ? Math.round((g0 + 2 * g1) / 3) : 0,
      b: c0 > c1 ? Math.round((b0 + 2 * b1) / 3) : 0,
      a: c0 > c1 ? 255 : 0 }
  ];

  // Extract 2-bit indices (16 pixels, 2 bits each = 4 bytes)
  const indices = blockBytes[4] | (blockBytes[5] << 8) | (blockBytes[6] << 16) | (blockBytes[7] << 24);

  // Write 4x4 block
  for (let py = 0; py < 4; py++) {
    for (let px = 0; px < 4; px++) {
      const pixelIndex = py * 4 + px;
      const colorIndex = (indices >> (pixelIndex * 2)) & 0x03;
      const color = colors[colorIndex];

      const tx = x + px;
      const ty = y + py;

      if (tx < width && ty < height) {
        const offset = (ty * width + tx) * 4;
        target[offset] = color.r;
        target[offset + 1] = color.g;
        target[offset + 2] = color.b;
        target[offset + 3] = color.a;
      }
    }
  }
}

/**
 * Decode a single DXT3 (BC2) block to 4x4 RGBA8
 * DXT3: 16 bytes -> 4x4 pixels. 8 bytes explicit alpha (4-bit per pixel) + 8 bytes DXT1 color
 */
function decodeDxt3Block(blockBytes, target, width, height, x, y) {
  // First 8 bytes: alpha values (4-bit each, 4 values per byte)
  const alphaBytes = blockBytes.subarray(0, 8);
  // Last 8 bytes: DXT1 color data
  const colorBytes = blockBytes.subarray(8, 16);

  // Decode alpha values
  const alphaValues = [];
  for (let i = 0; i < 8; i++) {
    const byte = alphaBytes[i];
    alphaValues.push(
      scale4(byte & 0x0F), // scale4 for alpha: 0-15 -> 0-255
      scale4((byte >> 4) & 0x0F)
    );
  }

  // DXT3/BC2 color blocks always use four-color interpolation. The
  // three-color-plus-transparent mode selected by c0 <= c1 is DXT1-only.
  const colors = dxtFourColorPalette(colorBytes);

  // Extract color indices
  const colorIndices = colorBytes[4] | (colorBytes[5] << 8) | (colorBytes[6] << 16) | (colorBytes[7] << 24);

  // Write 4x4 block
  for (let py = 0; py < 4; py++) {
    for (let px = 0; px < 4; px++) {
      const pixelIndex = py * 4 + px;
      const colorIndex = (colorIndices >> (pixelIndex * 2)) & 0x03;
      const color = colors[colorIndex];
      const alphaIndex = pixelIndex;

      const tx = x + px;
      const ty = y + py;

      if (tx < width && ty < height) {
        const offset = (ty * width + tx) * 4;
        target[offset] = color.r;
        target[offset + 1] = color.g;
        target[offset + 2] = color.b;
        target[offset + 3] = alphaValues[alphaIndex];
      }
    }
  }
}

/**
 * Decode a single DXT5 (BC3) block to 4x4 RGBA8
 * DXT5: 16 bytes -> 4x4 pixels. 8 bytes alpha (2 endpoints + 6×3-bit indices) + 8 bytes DXT1 color
 */
function decodeDxt5Block(blockBytes, target, width, height, x, y) {
  // First 8 bytes: alpha data
  const alpha0 = blockBytes[0];
  const alpha1 = blockBytes[1];

  // Generate 8 alpha values per BC3 spec:
  // alpha0 > alpha1: 8-value interpolation mode
  // alpha0 <= alpha1: 6-value interpolation + 0 and 255 mode
  const alphaValues = [
    alpha0,
    alpha1,
    alpha0 > alpha1 ? Math.round((6 * alpha0 + alpha1) / 7) : Math.round((4 * alpha0 + alpha1) / 5),
    alpha0 > alpha1 ? Math.round((5 * alpha0 + 2 * alpha1) / 7) : Math.round((3 * alpha0 + 2 * alpha1) / 5),
    alpha0 > alpha1 ? Math.round((4 * alpha0 + 3 * alpha1) / 7) : Math.round((2 * alpha0 + 3 * alpha1) / 5),
    alpha0 > alpha1 ? Math.round((3 * alpha0 + 4 * alpha1) / 7) : Math.round((alpha0 + 4 * alpha1) / 5),
    alpha0 > alpha1 ? Math.round((2 * alpha0 + 5 * alpha1) / 7) : 0,
    alpha0 > alpha1 ? Math.round((alpha0 + 6 * alpha1) / 7) : 255
  ];

  // Last 8 bytes: DXT1 color data
  const colorBytes = blockBytes.subarray(8, 16);

  // DXT5/BC3 color blocks always use four-color interpolation. The
  // three-color-plus-transparent mode selected by c0 <= c1 is DXT1-only.
  const colors = dxtFourColorPalette(colorBytes);

  // Extract color indices
  const colorIndices = colorBytes[4] | (colorBytes[5] << 8) | (colorBytes[6] << 16) | (colorBytes[7] << 24);

  // Write 4x4 block
  for (let py = 0; py < 4; py++) {
    for (let px = 0; px < 4; px++) {
      const pixelIndex = py * 4 + px;
      const colorIndex = (colorIndices >> (pixelIndex * 2)) & 0x03;
      const alphaBitOffset = pixelIndex * 3;
      const alphaByteOffset = 2 + Math.floor(alphaBitOffset / 8);
      const alphaBitShift = alphaBitOffset & 0x07;
      const alphaSelectorBits = blockBytes[alphaByteOffset] |
        ((blockBytes[alphaByteOffset + 1] ?? 0) << 8);
      const alphaIndex = (alphaSelectorBits >> alphaBitShift) & 0x07;
      const color = colors[colorIndex];
      const alpha = alphaValues[alphaIndex];

      const tx = x + px;
      const ty = y + py;

      if (tx < width && ty < height) {
        const offset = (ty * width + tx) * 4;
        target[offset] = color.r;
        target[offset + 1] = color.g;
        target[offset + 2] = color.b;
        target[offset + 3] = alpha;
      }
    }
  }
}

/**
 * Main DXT decoder function
 * Decodes DXT1/DXT3/DXT5 compressed texture data to RGBA8
 * Handles non-multiple-of-4 dimensions by clamping block writes
 */
function decodeDxtToRgba8(bytes, width, height, dxtKind) {
  if (!bytes || !width || !height) {
    return null;
  }
  d3d8TextureStats.dxtDecodes += 1;

  const pixelCount = width * height;
  const target = new Uint8Array(pixelCount * 4);

  // Calculate number of blocks in each dimension
  const blockWidth = Math.ceil(width / 4);
  const blockHeight = Math.ceil(height / 4);

  let bytesPerBlock = 8;
  let decoder;

  switch (dxtKind) {
    case "DXT1":
      bytesPerBlock = 8;
      decoder = decodeDxt1Block;
      break;
    case "DXT3":
    case "DXT2": // Treat DXT2 like DXT3 (premultiplied alpha handled as straight for now)
      bytesPerBlock = 16;
      decoder = decodeDxt3Block;
      break;
    case "DXT5":
    case "DXT4": // Treat DXT4 like DXT5 (premultiplied alpha handled as straight for now)
      bytesPerBlock = 16;
      decoder = decodeDxt5Block;
      break;
    default:
      console.warn(`Unknown DXT format: ${dxtKind}`);
      return null;
  }

  const totalBlocks = blockWidth * blockHeight;
  const expectedBytes = totalBlocks * bytesPerBlock;

  if (bytes.length < expectedBytes) {
    console.warn(`DXT data too short: expected ${expectedBytes} bytes, got ${bytes.length}`);
    return null;
  }

  // Decode each block
  for (let by = 0; by < blockHeight; by++) {
    for (let bx = 0; bx < blockWidth; bx++) {
      const blockOffset = (by * blockWidth + bx) * bytesPerBlock;
      const blockBytes = bytes.subarray(blockOffset, blockOffset + bytesPerBlock);
      const x = bx * 4;
      const y = by * 4;

      decoder(blockBytes, target, width, height, x, y);
    }
  }

  return target;
}

// Helper functions for DXT decoding
function scale6(value) {
  return (value << 2) | (value >> 4);
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

const DEFAULT_D3D8_MATERIAL = {
  diffuse: [1, 1, 1, 1],
  ambient: [1, 1, 1, 1],
  specular: [0, 0, 0, 0],
  emissive: [0, 0, 0, 0],
  power: 1,
};

function normalizeD3D8ColorValue(value, fallback) {
  const source = Array.isArray(value)
    ? value
    : [value?.r, value?.g, value?.b, value?.a];
  return [0, 1, 2, 3].map((index) => {
    const component = Number(source[index] ?? fallback[index]);
    return Number.isFinite(component) ? component : fallback[index];
  });
}

function normalizeD3D8Material(material = {}) {
  const source = material ?? {};
  const power = Number(source.power ?? DEFAULT_D3D8_MATERIAL.power);
  return {
    diffuse: normalizeD3D8ColorValue(source.diffuse, DEFAULT_D3D8_MATERIAL.diffuse),
    ambient: normalizeD3D8ColorValue(source.ambient, DEFAULT_D3D8_MATERIAL.ambient),
    specular: normalizeD3D8ColorValue(source.specular, DEFAULT_D3D8_MATERIAL.specular),
    emissive: normalizeD3D8ColorValue(source.emissive, DEFAULT_D3D8_MATERIAL.emissive),
    power: Number.isFinite(power) ? power : DEFAULT_D3D8_MATERIAL.power,
  };
}

function normalizeD3D8Vector3(value, fallback = [0, 0, 0]) {
  const source = Array.isArray(value)
    ? value
    : [value?.x, value?.y, value?.z];
  return [0, 1, 2].map((index) => {
    const component = Number(source[index] ?? fallback[index]);
    return Number.isFinite(component) ? component : fallback[index];
  });
}

function normalizeD3D8Light(light = {}, index = 0) {
  return {
    index: Number(light?.index ?? index) >>> 0,
    type: Number(light?.type ?? 0) >>> 0,
    enabled: Number(light?.enabled ?? 0) !== 0,
    diffuse: normalizeD3D8ColorValue(light?.diffuse, [0, 0, 0, 1]),
    specular: normalizeD3D8ColorValue(light?.specular, [0, 0, 0, 1]),
    ambient: normalizeD3D8ColorValue(light?.ambient, [0, 0, 0, 1]),
    position: normalizeD3D8Vector3(light?.position),
    direction: normalizeD3D8Vector3(light?.direction, [0, 0, 1]),
    range: finiteNumber(light?.range, 0),
    falloff: finiteNumber(light?.falloff, 0),
    attenuation0: finiteNumber(light?.attenuation0, 0),
    attenuation1: finiteNumber(light?.attenuation1, 0),
    attenuation2: finiteNumber(light?.attenuation2, 0),
    theta: finiteNumber(light?.theta, 0),
    phi: finiteNumber(light?.phi, 0),
  };
}

function normalizeD3D8Lights(lights) {
  return Array.from({ length: D3D8_LIGHT_COUNT }, (_, index) =>
    normalizeD3D8Light(Array.isArray(lights) ? lights[index] : null, index));
}

function d3d8DirectionalLights(lights) {
  return lights
    .filter((light) => light.enabled && light.type === D3DLIGHT_DIRECTIONAL)
    .slice(0, D3D8_DIRECTIONAL_LIGHT_UNIFORM_COUNT);
}

function d3d8FixedFunctionLights(lights) {
  return lights
    .filter((light) => light.enabled
      && (light.type === D3DLIGHT_POINT
        || light.type === D3DLIGHT_SPOT
        || light.type === D3DLIGHT_DIRECTIONAL))
    .slice(0, D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT);
}

function d3d8FixedLightUniformKey(lights) {
  const values = [lights.length];
  for (const light of lights) {
    values.push(light.type);
    values.push(...light.diffuse);
    values.push(...light.specular);
    values.push(...light.ambient);
    values.push(...light.position);
    values.push(...light.direction);
    values.push(
      light.range,
      light.attenuation0,
      light.attenuation1,
      light.attenuation2,
      light.theta,
      light.phi,
      light.falloff,
    );
  }
  return values.join(",");
}

function d3d8CaptureRenderUniformKey(
    derivedStateHash,
    primitiveType,
    usePositionTransforms,
    vertexPretransformed,
    appliedViewport) {
  const d3d = vertexPretransformed ? appliedViewport?.d3d : null;
  return {
    derivedStateHash,
    primitiveType,
    usePositionTransforms: usePositionTransforms ? 1 : 0,
    vertexPretransformed: vertexPretransformed ? 1 : 0,
    viewportX: d3d ? finiteNumber(d3d.x, 0) : 0,
    viewportY: d3d ? finiteNumber(d3d.y, 0) : 0,
    viewportWidth: d3d ? Math.max(1, finiteNumber(d3d.width, 1)) : 0,
    viewportHeight: d3d ? Math.max(1, finiteNumber(d3d.height, 1)) : 0,
  };
}

function d3d8RenderUniformKeyMatches(
    key,
    derivedStateHash,
    primitiveType,
    usePositionTransforms,
    vertexPretransformed,
    appliedViewport) {
  if (!key ||
      key.derivedStateHash !== derivedStateHash ||
      key.primitiveType !== primitiveType ||
      key.usePositionTransforms !== (usePositionTransforms ? 1 : 0) ||
      key.vertexPretransformed !== (vertexPretransformed ? 1 : 0)) {
    return false;
  }
  const d3d = vertexPretransformed ? appliedViewport?.d3d : null;
  const viewportX = d3d ? finiteNumber(d3d.x, 0) : 0;
  const viewportY = d3d ? finiteNumber(d3d.y, 0) : 0;
  const viewportWidth = d3d ? Math.max(1, finiteNumber(d3d.width, 1)) : 0;
  const viewportHeight = d3d ? Math.max(1, finiteNumber(d3d.height, 1)) : 0;
  return key.viewportX === viewportX &&
    key.viewportY === viewportY &&
    key.viewportWidth === viewportWidth &&
    key.viewportHeight === viewportHeight;
}

function d3d8BaseUniformSnapshotMatches(useTransforms, usePretransformedPosition,
    appliedViewport, appliedRenderState, clipPlanes, shadeModeDraw) {
  const snapshot = d3d8LastBaseUniformSnapshot;
  const d3d = usePretransformedPosition ? appliedViewport?.d3d : null;
  const clipPlaneMask = usePretransformedPosition ? 0 : appliedRenderState.clipPlanes.mask;
  if (!snapshot.valid ||
      snapshot.useTransforms !== Boolean(useTransforms) ||
      snapshot.pretransformed !== Boolean(usePretransformedPosition) ||
      snapshot.viewportX !== (d3d ? finiteNumber(d3d.x, 0) : 0) ||
      snapshot.viewportY !== (d3d ? finiteNumber(d3d.y, 0) : 0) ||
      snapshot.viewportWidth !== (d3d ? Math.max(1, finiteNumber(d3d.width, 1)) : 0) ||
      snapshot.viewportHeight !== (d3d ? Math.max(1, finiteNumber(d3d.height, 1)) : 0) ||
      snapshot.depthBiasNdc !== appliedRenderState.depthBiasNdc ||
      snapshot.clipPlaneMask !== clipPlaneMask ||
      snapshot.flatShade !== Boolean(shadeModeDraw.usesFlatShader) ||
      snapshot.lightingEnabled !== Boolean(appliedRenderState.lightingShaderEnabled) ||
      snapshot.specularEnabled !== Boolean(appliedRenderState.specularEnabled) ||
      snapshot.normalizeNormals !== Boolean(appliedRenderState.normalizeNormalsEnabled) ||
      snapshot.localViewer !== Boolean(appliedRenderState.localViewerEnabled) ||
      snapshot.colorVertex !== Boolean(appliedRenderState.colorVertexEnabled)) {
    return false;
  }
  if (clipPlaneMask === 0) {
    return true;
  }
  for (let planeIndex = 0; planeIndex < D3D8_CLIP_PLANE_COUNT; ++planeIndex) {
    const plane = clipPlanes[planeIndex];
    for (let component = 0; component < 4; ++component) {
      if (snapshot.clipPlanes[planeIndex * 4 + component] !== Number(plane?.[component] ?? 0)) {
        return false;
      }
    }
  }
  return true;
}

function rememberD3D8BaseUniformSnapshot(useTransforms, usePretransformedPosition,
    appliedViewport, appliedRenderState, clipPlanes, shadeModeDraw) {
  const snapshot = d3d8LastBaseUniformSnapshot;
  const d3d = usePretransformedPosition ? appliedViewport?.d3d : null;
  snapshot.valid = true;
  snapshot.useTransforms = Boolean(useTransforms);
  snapshot.pretransformed = Boolean(usePretransformedPosition);
  snapshot.viewportX = d3d ? finiteNumber(d3d.x, 0) : 0;
  snapshot.viewportY = d3d ? finiteNumber(d3d.y, 0) : 0;
  snapshot.viewportWidth = d3d ? Math.max(1, finiteNumber(d3d.width, 1)) : 0;
  snapshot.viewportHeight = d3d ? Math.max(1, finiteNumber(d3d.height, 1)) : 0;
  snapshot.depthBiasNdc = appliedRenderState.depthBiasNdc;
  snapshot.clipPlaneMask = usePretransformedPosition ? 0 : appliedRenderState.clipPlanes.mask;
  snapshot.flatShade = Boolean(shadeModeDraw.usesFlatShader);
  snapshot.lightingEnabled = Boolean(appliedRenderState.lightingShaderEnabled);
  snapshot.specularEnabled = Boolean(appliedRenderState.specularEnabled);
  snapshot.normalizeNormals = Boolean(appliedRenderState.normalizeNormalsEnabled);
  snapshot.localViewer = Boolean(appliedRenderState.localViewerEnabled);
  snapshot.colorVertex = Boolean(appliedRenderState.colorVertexEnabled);
  if (snapshot.clipPlaneMask !== 0) {
    for (let planeIndex = 0; planeIndex < D3D8_CLIP_PLANE_COUNT; ++planeIndex) {
      const plane = clipPlanes[planeIndex];
      for (let component = 0; component < 4; ++component) {
        snapshot.clipPlanes[planeIndex * 4 + component] = Number(plane?.[component] ?? 0);
      }
    }
  }
}

function d3d8StageUniformKey(renderState) {
  const stage0 = renderState.textureStages[0];
  const stage1 = renderState.textureStages[1];
  const stage2 = renderState.textureStages[2];
  const stage3 = renderState.textureStages[3];
  return [
    renderState.textureFactor,
    stage0.colorOp,
    stage0.colorArg0,
    stage0.colorArg1,
    stage0.colorArg2,
    stage0.alphaOp,
    stage0.alphaArg0,
    stage0.alphaArg1,
    stage0.alphaArg2,
    stage0.resultArg,
    stage1.colorOp,
    stage1.colorArg0,
    stage1.colorArg1,
    stage1.colorArg2,
    stage1.alphaOp,
    stage1.alphaArg0,
    stage1.alphaArg1,
    stage1.alphaArg2,
    stage1.resultArg,
    stage2.colorOp,
    stage2.colorArg0,
    stage2.colorArg1,
    stage2.colorArg2,
    stage2.alphaOp,
    stage2.alphaArg0,
    stage2.alphaArg1,
    stage2.alphaArg2,
    stage2.resultArg,
    stage3.colorOp,
    stage3.colorArg0,
    stage3.colorArg1,
    stage3.colorArg2,
    stage3.alphaOp,
    stage3.alphaArg0,
    stage3.alphaArg1,
    stage3.alphaArg2,
    stage3.resultArg,
  ].join(",");
}

function d3d8AlphaFogUniformKey(renderState, appliedRenderState) {
  return [
    appliedRenderState.alphaTestEnabled ? 1 : 0,
    renderState.alphaFunc,
    appliedRenderState.alphaRef,
    appliedRenderState.fogEnabled ? 1 : 0,
    appliedRenderState.fogRangeEnabled ? 1 : 0,
    ...appliedRenderState.fogColor,
    appliedRenderState.fogStart,
    appliedRenderState.fogEnd,
  ].join(",");
}

function d3d8TextureLayoutUniformKey({
  renderState,
  canSampleTexture0,
  canSampleTexture1,
  canSampleTexture2,
  canSampleTexture3,
  texture0Coordinates,
  texture1Coordinates,
  texture2Coordinates,
  texture3Coordinates,
  texture0SemanticMode,
  texture1SemanticMode,
  texture2SemanticMode,
  texture3SemanticMode,
  texture0FlipY,
  texture1FlipY,
  texture2FlipY,
  texture3FlipY,
  implicitAlphaCutoutThreshold,
  texture0Transform,
  texture1Transform,
  texture2Transform,
  texture3Transform,
}) {
  const values = [implicitAlphaCutoutThreshold];
  appendD3D8TextureLayoutStageKey(values,
    renderState.textureStages[0],
    canSampleTexture0,
    texture0Coordinates,
    texture0SemanticMode,
    texture0FlipY,
    texture0Transform,
  );
  appendD3D8TextureLayoutStageKey(values,
    renderState.textureStages[1],
    canSampleTexture1,
    texture1Coordinates,
    texture1SemanticMode,
    texture1FlipY,
    texture1Transform,
  );
  appendD3D8TextureLayoutStageKey(values,
    renderState.textureStages[2],
    canSampleTexture2,
    texture2Coordinates,
    texture2SemanticMode,
    texture2FlipY,
    texture2Transform,
    true,
  );
  appendD3D8TextureLayoutStageKey(values,
    renderState.textureStages[3],
    canSampleTexture3,
    texture3Coordinates,
    texture3SemanticMode,
    texture3FlipY,
    texture3Transform,
    true,
  );
  return values.join(",");
}

function appendD3D8TextureLayoutStageKey(values, stage, canSampleTexture,
    coordinates, semanticMode, flipY, textureTransform, includeCoordSet = false) {
  const transformApplied = Boolean(canSampleTexture && coordinates.transformApplied);
  values.push(
    canSampleTexture ? 1 : 0,
    canSampleTexture ? coordinates.mode : D3DTSS_TCI_PASSTHRU,
    transformApplied ? 1 : 0,
    transformApplied ? coordinates.textureTransformComponentCount : 0,
    transformApplied && coordinates.textureTransformProjected ? 1 : 0,
    canSampleTexture ? Number(stage.mipMapLodBias ?? 0) >>> 0 : 0,
    canSampleTexture ? semanticMode : 0,
    canSampleTexture && flipY ? 1 : 0,
  );
  // Stages 2/3 select which vertex UV set feeds the shader, so the coordinate
  // index participates in the layout key. Stages 0/1 always map coordSet->attr
  // 1:1 in the vertex fetch, so their key is left unchanged.
  if (includeCoordSet) {
    values.push(canSampleTexture ? (coordinates.coordSet >>> 0) : 0);
  }
  if (transformApplied) {
    values.push(...textureTransform);
  }
}

const D3D8_DEFAULT_LIGHT_DIRECTION = Object.freeze([0, 0, 1]);
const d3d8LightUniformScratch = {
  types: new Int32Array(D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT),
  colors: new Float32Array(D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT * 4),
  vectors: new Float32Array(D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT * 3),
  rangeAttenuation: new Float32Array(D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT * 4),
  spot: new Float32Array(D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT * 3),
};

function flattenD3D8LightType(lights) {
  const values = d3d8LightUniformScratch.types;
  for (let index = 0; index < D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT; ++index) {
    values[index] = lights[index]?.type ?? 0;
  }
  return values;
}

function flattenD3D8LightColor(lights, field, count = D3D8_DIRECTIONAL_LIGHT_UNIFORM_COUNT) {
  const values = d3d8LightUniformScratch.colors;
  for (let index = 0; index < count; ++index) {
    const source = lights[index]?.[field];
    const base = index * 4;
    values[base] = source?.[0] ?? 0;
    values[base + 1] = source?.[1] ?? 0;
    values[base + 2] = source?.[2] ?? 0;
    values[base + 3] = source?.[3] ?? 1;
  }
  return values;
}

function flattenD3D8LightVector(lights, field, fallback, count = D3D8_DIRECTIONAL_LIGHT_UNIFORM_COUNT) {
  const values = d3d8LightUniformScratch.vectors;
  for (let index = 0; index < count; ++index) {
    const source = lights[index]?.[field] ?? fallback;
    const base = index * 3;
    values[base] = source[0];
    values[base + 1] = source[1];
    values[base + 2] = source[2];
  }
  return values;
}

function flattenD3D8LightDirection(lights, count = D3D8_DIRECTIONAL_LIGHT_UNIFORM_COUNT) {
  return flattenD3D8LightVector(lights, "direction", D3D8_DEFAULT_LIGHT_DIRECTION, count);
}

function flattenD3D8LightRangeAttenuation(lights) {
  const values = d3d8LightUniformScratch.rangeAttenuation;
  for (let index = 0; index < D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT; ++index) {
    const light = lights[index];
    const base = index * 4;
    values[base] = finiteNumber(light?.range, 0);
    values[base + 1] = finiteNumber(light?.attenuation0, 0);
    values[base + 2] = finiteNumber(light?.attenuation1, 0);
    values[base + 3] = finiteNumber(light?.attenuation2, 0);
  }
  return values;
}

function flattenD3D8LightSpot(lights) {
  const values = d3d8LightUniformScratch.spot;
  for (let index = 0; index < D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT; ++index) {
    const light = lights[index];
    const base = index * 3;
    values[base] = finiteNumber(light?.theta, 0);
    values[base + 1] = finiteNumber(light?.phi, 0);
    values[base + 2] = finiteNumber(light?.falloff, 0);
  }
  return values;
}

function textureHasCompleteMipChain(resource) {
  if (!resource || resource.levels <= 1) {
    return false;
  }
  if (typeof resource.completeMipChain === "boolean") {
    return resource.completeMipChain;
  }
  for (let level = 0; level < resource.levels; ++level) {
    if (!resource.initializedLevels.has(String(level))) {
      return false;
    }
  }
  return true;
}

function updateD3D8TextureMipCompleteness(resource) {
  if (!resource) {
    return false;
  }
  let complete = false;
  if (resource.levels > 1 && resource.initializedLevels?.size >= resource.levels) {
    complete = true;
    for (let level = 0; level < resource.levels; ++level) {
      if (!resource.initializedLevels.has(String(level))) {
        complete = false;
        break;
      }
    }
  }
  resource.completeMipChain = complete;
  return complete;
}

function d3d8SamplerStateMatches(resource, {
  min,
  mag,
  wrapS,
  wrapT,
  baseLevel,
  maxLevel,
  lodBiasBits,
  completeMipChain,
}) {
  const key = resource?.samplerStateKey;
  return Boolean(key) &&
    key.min === min.value &&
    key.mag === mag.value &&
    key.wrapS === wrapS.value &&
    key.wrapT === wrapT.value &&
    key.baseLevel === baseLevel &&
    key.maxLevel === maxLevel &&
    key.lodBiasBits === lodBiasBits &&
    key.completeMipChain === (completeMipChain ? 1 : 0);
}

function captureD3D8TextureSamplerRawKey(textureStage, resource, samplerParams = null) {
  if (!resource?.texture || !textureStage) {
    return null;
  }
  return {
    minFilter: Number(textureStage.minFilter ?? 0) >>> 0,
    magFilter: Number(textureStage.magFilter ?? 0) >>> 0,
    mipFilter: Number(textureStage.mipFilter ?? 0) >>> 0,
    addressU: Number(textureStage.addressU ?? 0) >>> 0,
    addressV: Number(textureStage.addressV ?? 0) >>> 0,
    maxMipLevel: Number(textureStage.maxMipLevel ?? 0) >>> 0,
    mipMapLodBias: Number(textureStage.mipMapLodBias ?? 0) >>> 0,
    levelCount: Math.max(1, Number(resource.levels ?? 1) >>> 0),
    completeMipChain: (samplerParams?.completeMipChain ?? textureHasCompleteMipChain(resource)) ? 1 : 0,
  };
}

function d3d8TextureSamplerRawStateCurrent(textureStage, resource) {
  const key = resource?.samplerD3DStateKey;
  if (!resource?.samplerState || !resource?.texture || !textureStage || !key) {
    return false;
  }
  const levelCount = Math.max(1, Number(resource.levels ?? 1) >>> 0);
  const completeMipChain = textureHasCompleteMipChain(resource) ? 1 : 0;
  return Boolean(
    key.minFilter === (Number(textureStage.minFilter ?? 0) >>> 0) &&
    key.magFilter === (Number(textureStage.magFilter ?? 0) >>> 0) &&
    key.mipFilter === (Number(textureStage.mipFilter ?? 0) >>> 0) &&
    key.addressU === (Number(textureStage.addressU ?? 0) >>> 0) &&
    key.addressV === (Number(textureStage.addressV ?? 0) >>> 0) &&
    key.maxMipLevel === (Number(textureStage.maxMipLevel ?? 0) >>> 0) &&
    key.mipMapLodBias === (Number(textureStage.mipMapLodBias ?? 0) >>> 0) &&
    key.levelCount === levelCount &&
    key.completeMipChain === completeMipChain
  );
}

function d3d8TextureSamplerParams(textureStage, resource) {
  if (!resource?.texture || !textureStage) {
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
  return {
    completeMipChain,
    min,
    mag,
    wrapS,
    wrapT,
    baseLevel,
    maxLevel,
    lodBiasBits,
    lodBias,
    requestedMaxMipLevel,
  };
}

function d3d8TextureSamplerStateCurrent(textureStage, resource, params = null) {
  const samplerParams = params ?? d3d8TextureSamplerParams(textureStage, resource);
  return Boolean(
    resource?.samplerState &&
    samplerParams &&
    d3d8SamplerStateMatches(resource, samplerParams));
}

function applyD3D8TextureSamplerToBoundTexture(stage, textureStage, resource, params = null) {
  if (!gl || !resource?.texture || !textureStage) {
    return null;
  }
  const samplerParams = params ?? d3d8TextureSamplerParams(textureStage, resource);
  if (!samplerParams) {
    return null;
  }
  const {
    completeMipChain,
    min,
    mag,
    wrapS,
    wrapT,
    baseLevel,
    maxLevel,
    lodBiasBits,
    lodBias,
    requestedMaxMipLevel,
  } = samplerParams;
  if (d3d8TextureSamplerStateCurrent(textureStage, resource, samplerParams)) {
    if (d3d8DiagLevel === "full") {
      d3d8TextureStats.lastSampler = resource.samplerState;
      updateD3D8TextureSummary();
    }
    return resource.samplerState;
  }
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
  resource.samplerStateKey = {
    min: min.value,
    mag: mag.value,
    wrapS: wrapS.value,
    wrapT: wrapT.value,
    baseLevel,
    maxLevel,
    lodBiasBits,
    completeMipChain: completeMipChain ? 1 : 0,
  };
  resource.samplerD3DStateKey = captureD3D8TextureSamplerRawKey(textureStage, resource, samplerParams);
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
    case D3DTOP_BLENDTEXTUREALPHAPM:
      return "blendTextureAlphaPremultiplied";
    case D3DTOP_BLENDCURRENTALPHA:
      return "blendCurrentAlpha";
    case D3DTOP_PREMODULATE:
      return "premodulate";
    case D3DTOP_MODULATEALPHA_ADDCOLOR:
      return "modulateAlphaAddColor";
    case D3DTOP_MODULATECOLOR_ADDALPHA:
      return "modulateColorAddAlpha";
    case D3DTOP_MODULATEINVALPHA_ADDCOLOR:
      return "modulateInvAlphaAddColor";
    case D3DTOP_MODULATEINVCOLOR_ADDALPHA:
      return "modulateInvColorAddAlpha";
    case D3DTOP_BUMPENVMAP:
      return "bumpEnvMap";
    case D3DTOP_BUMPENVMAPLUMINANCE:
      return "bumpEnvMapLuminance";
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

function d3dTextureCombinerOpSupported(op, target = "color") {
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
    case D3DTOP_BLENDTEXTUREALPHAPM:
    case D3DTOP_BLENDCURRENTALPHA:
    case D3DTOP_DOTPRODUCT3:
    case D3DTOP_MULTIPLYADD:
    case D3DTOP_LERP:
      return true;
    case D3DTOP_MODULATEALPHA_ADDCOLOR:
    case D3DTOP_MODULATECOLOR_ADDALPHA:
    case D3DTOP_MODULATEINVALPHA_ADDCOLOR:
    case D3DTOP_MODULATEINVCOLOR_ADDALPHA:
      return target === "color";
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
    case D3DTOP_BLENDTEXTUREALPHAPM:
    case D3DTOP_BLENDCURRENTALPHA:
    case D3DTOP_PREMODULATE:
    case D3DTOP_MODULATEALPHA_ADDCOLOR:
    case D3DTOP_MODULATECOLOR_ADDALPHA:
    case D3DTOP_MODULATEINVALPHA_ADDCOLOR:
    case D3DTOP_MODULATEINVCOLOR_ADDALPHA:
    case D3DTOP_BUMPENVMAP:
    case D3DTOP_BUMPENVMAPLUMINANCE:
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
    case D3DTOP_BLENDTEXTUREALPHAPM:
    case D3DTOP_BLENDCURRENTALPHA:
    case D3DTOP_PREMODULATE:
    case D3DTOP_MODULATEALPHA_ADDCOLOR:
    case D3DTOP_MODULATECOLOR_ADDALPHA:
    case D3DTOP_MODULATEINVALPHA_ADDCOLOR:
    case D3DTOP_MODULATEINVCOLOR_ADDALPHA:
    case D3DTOP_BUMPENVMAP:
    case D3DTOP_BUMPENVMAPLUMINANCE:
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
    case D3DTA_SPECULAR:
      return "specular";
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
    case D3DTSS_TCI_CAMERASPACENORMAL:
      return "cameraSpaceNormal";
    case D3DTSS_TCI_CAMERASPACEPOSITION:
      return "cameraSpacePosition";
    case D3DTSS_TCI_CAMERASPACEREFLECTIONVECTOR:
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

function d3dTextureTransformFlagsInfo(flags) {
  const normalizedFlags = Number(flags) >>> 0;
  const projected = (normalizedFlags & D3DTTFF_PROJECTED) !== 0;
  const count = normalizedFlags & ~D3DTTFF_PROJECTED;
  let componentCount = 0;
  switch (count) {
    case D3DTTFF_COUNT1:
    case D3DTTFF_COUNT2:
    case D3DTTFF_COUNT3:
    case D3DTTFF_COUNT4:
      componentCount = count;
      break;
    default:
      componentCount = 0;
      break;
  }
  const twoDSamplerSupported = normalizedFlags === D3DTTFF_DISABLE ||
    (!projected && componentCount >= 2 && componentCount <= 4) ||
    (projected && componentCount === 3);
  return {
    modeName: d3dTextureTransformFlagsName(normalizedFlags),
    componentCount,
    projected,
    twoDSamplerSupported,
  };
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
    pretransformed: false,
    normalOffset: stride >= D3D8_NORMAL_MIN_STRIDE ? D3D8_NORMAL_OFFSET : null,
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

  const normalOffset = (normalizedFvf & D3DFVF_NORMAL) === D3DFVF_NORMAL
    ? offset
    : null;
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
    pretransformed: (normalizedFvf & D3DFVF_XYZRHW) === D3DFVF_XYZRHW,
    normalOffset: normalOffset !== null && stride >= normalOffset + 3 * 4 ? normalOffset : null,
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
  const generated = mode === D3DTSS_TCI_CAMERASPACENORMAL ||
    mode === D3DTSS_TCI_CAMERASPACEPOSITION ||
    mode === D3DTSS_TCI_CAMERASPACEREFLECTIONVECTOR;
  const coordSetAvailable = Boolean(texCoord?.available);
  const transformInfo = d3dTextureTransformFlagsInfo(textureTransformFlags);
  const transformApplied = textureTransformFlags !== D3DTTFF_DISABLE &&
    textureTransform !== null &&
    transformInfo.twoDSamplerSupported;
  const transformSupported = textureTransformFlags === D3DTTFF_DISABLE || transformApplied;
  const coordinateSupported = (passthru && coordSetAvailable) || generated;
  return {
    stage,
    texCoordIndex,
    mode,
    modeName: d3dTextureCoordinateModeName(mode),
    coordSet,
    layoutSource: layout.source,
    offset: passthru && coordSetAvailable ? texCoordOffset : null,
    components: passthru && coordSetAvailable ? texCoord.components : generated ? 3 : 0,
    generated,
    usesVertexTexCoord: passthru,
    textureTransformFlags,
    textureTransformModeName: transformInfo.modeName,
    textureTransformComponentCount: transformInfo.componentCount,
    textureTransformProjected: transformInfo.projected,
    transformSupported,
    transformApplied,
    supported: coordinateSupported && transformSupported,
  };
}

function disabledTextureStageCoordinateInfo(stage) {
  const transformInfo = d3dTextureTransformFlagsInfo(D3DTTFF_DISABLE);
  return {
    stage,
    texCoordIndex: stage,
    mode: D3DTSS_TCI_PASSTHRU,
    modeName: d3dTextureCoordinateModeName(D3DTSS_TCI_PASSTHRU),
    coordSet: stage,
    layoutSource: "depth-stencil-only",
    offset: null,
    components: 0,
    generated: false,
    usesVertexTexCoord: false,
    textureTransformFlags: D3DTTFF_DISABLE,
    textureTransformModeName: transformInfo.modeName,
    textureTransformComponentCount: transformInfo.componentCount,
    textureTransformProjected: transformInfo.projected,
    transformSupported: true,
    transformApplied: false,
    supported: false,
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
  const supportedOp = d3dTextureCombinerOpSupported(colorOp, "color");
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
  const supportedAlphaOp = stage <= 3
    ? d3dTextureCombinerOpSupported(alphaOp, "alpha")
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
    needsTexture,
    needsTextureAlpha,
    textureAvailable: Boolean(canSampleTexture),
    supported: supportedOp && supportedArg0 && supportedArg1 && supportedArg2 && supportedResultArg
      && supportedAlphaOp && supportedAlphaArg0 && supportedAlphaArg1 && supportedAlphaArg2
      && (!needsTexture || canSampleTexture)
      && (!needsTextureAlpha || canSampleTexture),
  };
}

function warnD3D8CombinerDiagnostics(renderState, stage0Combiner, stage1Combiner,
    stage2Combiner, stage3Combiner, drawSequence) {
  for (const combiner of [stage0Combiner, stage1Combiner, stage2Combiner, stage3Combiner]) {
    if (!combiner || combiner.supported) {
      continue;
    }
    const reasons = [];
    if (!combiner.supportsColorOp) {
      reasons.push(`colorOp=${combiner.opName}`);
    }
    if (!combiner.supportsColorArgs) {
      reasons.push("colorArgs");
    }
    if (!combiner.supportsResultArg) {
      reasons.push(`resultArg=${combiner.resultArgName}`);
    }
    if (!combiner.supportsAlphaOp) {
      reasons.push(`alphaOp=${combiner.alphaOpName}`);
    }
    if (!combiner.supportsAlphaArgs) {
      reasons.push("alphaArgs");
    }
    if ((combiner.needsTexture || combiner.needsTextureAlpha) && !combiner.textureAvailable) {
      reasons.push("textureUnavailable");
    }
    warnD3D8Once(
      `combiner:${combiner.stage}:${combiner.colorOp}:${combiner.alphaOp}:${reasons.join(",")}`,
      `texture combiner stage ${combiner.stage} is not fully supported`,
      {
        drawSequence,
        stage: combiner.stage,
        reasons,
        colorOp: combiner.colorOp,
        colorOpName: combiner.opName,
        alphaOp: combiner.alphaOp,
        alphaOpName: combiner.alphaOpName,
        colorArgs: [combiner.arg0Name, combiner.arg1Name, combiner.arg2Name],
        alphaArgs: [combiner.alphaArg0Name, combiner.alphaArg1Name, combiner.alphaArg2Name],
      },
    );
  }

  // Stages 0-3 are now rendered by the fixed-function combiner cascade. Stages
  // 4-7 are still not sampled by the browser shader, so keep warning if the
  // engine ever activates one (the shipped fixed-function paths top out at 4
  // simultaneous stages, so this should stay silent).
  for (let stage = 4; stage < D3D8_TEXTURE_STAGE_COUNT; ++stage) {
    const textureStage = renderState?.textureStages?.[stage];
    if (!textureStage) {
      continue;
    }
    const colorOp = Number(textureStage.colorOp ?? D3DTOP_DISABLE) >>> 0;
    const alphaOp = Number(textureStage.alphaOp ?? D3DTOP_DISABLE) >>> 0;
    if (colorOp === D3DTOP_DISABLE && alphaOp === D3DTOP_DISABLE) {
      continue;
    }
    warnD3D8Once(
      `stage:${stage}:${colorOp}:${alphaOp}`,
      `texture stage ${stage} is active but the browser shader currently renders only stages 0-3`,
      {
        drawSequence,
        stage,
        colorOp,
        colorOpName: d3dTextureCombinerOpName(colorOp),
        alphaOp,
        alphaOpName: d3dTextureCombinerOpName(alphaOp),
        colorArg1: d3dTextureCombinerArgName(textureStage.colorArg1),
        colorArg2: d3dTextureCombinerArgName(textureStage.colorArg2),
        alphaArg1: d3dTextureCombinerArgName(textureStage.alphaArg1),
        alphaArg2: d3dTextureCombinerArgName(textureStage.alphaArg2),
      },
    );
  }
}

function d3d8TextureFormatHasAlpha(format) {
  switch (Number(format) >>> 0) {
    case D3DFMT_A8R8G8B8:
    case D3DFMT_A1R5G5B5:
    case D3DFMT_A4R4G4B4:
    case D3DFMT_A8:
    case D3DFMT_A8L8:
    case D3DFMT_DXT1:
    case D3DFMT_DXT2:
    case D3DFMT_DXT3:
    case D3DFMT_DXT4:
    case D3DFMT_DXT5:
      return true;
    default:
      return false;
  }
}

const D3D8_IMPLICIT_ALPHA_CUTOUT_MIN_NONZERO_COVERAGE = 0.5;

function d3d8TextureAlphaCoverage(format, bytes, width, height) {
  const d3dFormat = Number(format) >>> 0;
  const textureWidth = Number(width) >>> 0;
  const textureHeight = Number(height) >>> 0;
  const totalTexels = textureWidth * textureHeight;
  if (!(bytes instanceof Uint8Array) || totalTexels === 0) {
    return null;
  }

  const finish = (nonzeroTexels) => ({
    nonzeroTexels,
    totalTexels,
    nonzeroCoverage: nonzeroTexels / totalTexels,
  });
  let nonzeroTexels = 0;

  if (d3dFormat === D3DFMT_A8R8G8B8) {
    if (bytes.length < totalTexels * 4) return null;
    for (let texel = 0; texel < totalTexels; ++texel) {
      if (bytes[texel * 4 + 3] !== 0) ++nonzeroTexels;
    }
    return finish(nonzeroTexels);
  }
  if (d3dFormat === D3DFMT_A1R5G5B5 || d3dFormat === D3DFMT_A4R4G4B4) {
    if (bytes.length < totalTexels * 2) return null;
    const alphaMask = d3dFormat === D3DFMT_A1R5G5B5 ? 0x8000 : 0xf000;
    for (let texel = 0; texel < totalTexels; ++texel) {
      const offset = texel * 2;
      const value = bytes[offset] | (bytes[offset + 1] << 8);
      if ((value & alphaMask) !== 0) ++nonzeroTexels;
    }
    return finish(nonzeroTexels);
  }
  if (d3dFormat === D3DFMT_A8 || d3dFormat === D3DFMT_A8L8) {
    const texelBytes = d3dFormat === D3DFMT_A8 ? 1 : 2;
    const alphaOffset = texelBytes - 1;
    if (bytes.length < totalTexels * texelBytes) return null;
    for (let texel = 0; texel < totalTexels; ++texel) {
      if (bytes[texel * texelBytes + alphaOffset] !== 0) ++nonzeroTexels;
    }
    return finish(nonzeroTexels);
  }

  const dxt1 = d3dFormat === D3DFMT_DXT1;
  const dxt3 = d3dFormat === D3DFMT_DXT2 || d3dFormat === D3DFMT_DXT3;
  const dxt5 = d3dFormat === D3DFMT_DXT4 || d3dFormat === D3DFMT_DXT5;
  if (!dxt1 && !dxt3 && !dxt5) {
    return null;
  }

  const blockWidth = Math.ceil(textureWidth / 4);
  const blockHeight = Math.ceil(textureHeight / 4);
  const bytesPerBlock = dxt1 ? 8 : 16;
  if (bytes.length < blockWidth * blockHeight * bytesPerBlock) {
    return null;
  }

  for (let blockY = 0; blockY < blockHeight; ++blockY) {
    for (let blockX = 0; blockX < blockWidth; ++blockX) {
      const blockOffset = (blockY * blockWidth + blockX) * bytesPerBlock;
      let alphaIndices = 0;
      let nonzeroAlphaMask = 0xff;
      let dxt1HasTransparentIndex = false;

      if (dxt1) {
        const color0 = bytes[blockOffset] | (bytes[blockOffset + 1] << 8);
        const color1 = bytes[blockOffset + 2] | (bytes[blockOffset + 3] << 8);
        dxt1HasTransparentIndex = color0 <= color1;
        alphaIndices = bytes[blockOffset + 4]
          + bytes[blockOffset + 5] * 0x100
          + bytes[blockOffset + 6] * 0x10000
          + bytes[blockOffset + 7] * 0x1000000;
      } else if (dxt5) {
        const alpha0 = bytes[blockOffset];
        const alpha1 = bytes[blockOffset + 1];
        nonzeroAlphaMask = (alpha0 !== 0 ? 0x01 : 0) | (alpha1 !== 0 ? 0x02 : 0);
        if (alpha0 > alpha1) {
          if (Math.round((6 * alpha0 + alpha1) / 7) !== 0) nonzeroAlphaMask |= 0x04;
          if (Math.round((5 * alpha0 + 2 * alpha1) / 7) !== 0) nonzeroAlphaMask |= 0x08;
          if (Math.round((4 * alpha0 + 3 * alpha1) / 7) !== 0) nonzeroAlphaMask |= 0x10;
          if (Math.round((3 * alpha0 + 4 * alpha1) / 7) !== 0) nonzeroAlphaMask |= 0x20;
          if (Math.round((2 * alpha0 + 5 * alpha1) / 7) !== 0) nonzeroAlphaMask |= 0x40;
          if (Math.round((alpha0 + 6 * alpha1) / 7) !== 0) nonzeroAlphaMask |= 0x80;
        } else {
          if (Math.round((4 * alpha0 + alpha1) / 5) !== 0) nonzeroAlphaMask |= 0x04;
          if (Math.round((3 * alpha0 + 2 * alpha1) / 5) !== 0) nonzeroAlphaMask |= 0x08;
          if (Math.round((2 * alpha0 + 3 * alpha1) / 5) !== 0) nonzeroAlphaMask |= 0x10;
          if (Math.round((alpha0 + 4 * alpha1) / 5) !== 0) nonzeroAlphaMask |= 0x20;
          // In six-value mode selector 6 is zero and selector 7 is 255.
          nonzeroAlphaMask |= 0x80;
        }
        for (let byte = 0; byte < 6; ++byte) {
          alphaIndices += bytes[blockOffset + 2 + byte] * (2 ** (byte * 8));
        }
      }

      const validWidth = Math.min(4, textureWidth - blockX * 4);
      const validHeight = Math.min(4, textureHeight - blockY * 4);
      for (let y = 0; y < validHeight; ++y) {
        for (let x = 0; x < validWidth; ++x) {
          const texel = y * 4 + x;
          let alpha = 255;
          if (dxt1) {
            const index = Math.floor(alphaIndices / (2 ** (texel * 2))) % 4;
            alpha = dxt1HasTransparentIndex && index === 3 ? 0 : 255;
          } else if (dxt3) {
            const packed = bytes[blockOffset + Math.floor(texel / 2)];
            alpha = (texel & 1) === 0 ? (packed & 0x0f) : (packed >> 4);
          } else {
            const index = Math.floor(alphaIndices / (2 ** (texel * 3))) % 8;
            alpha = nonzeroAlphaMask & (1 << index);
          }
          if (alpha !== 0) ++nonzeroTexels;
        }
      }
    }
  }
  return finish(nonzeroTexels);
}

function d3d8TextureSupportsImplicitAlphaCutout(resource) {
  const coverage = Number(resource?.alphaCoverage?.nonzeroCoverage);
  return d3d8TextureFormatHasAlpha(resource?.format) &&
    Number.isFinite(coverage) &&
    coverage >= D3D8_IMPLICIT_ALPHA_CUTOUT_MIN_NONZERO_COVERAGE;
}

function d3d8TextureStageAlphaUsesBase(textureStage, base) {
  if (!textureStage || Number(textureStage.alphaOp) >>> 0 === D3DTOP_DISABLE) {
    return false;
  }
  const alphaOp = Number(textureStage.alphaOp) >>> 0;
  const alphaArg0 = Number(textureStage.alphaArg0) >>> 0;
  const alphaArg1 = Number(textureStage.alphaArg1) >>> 0;
  const alphaArg2 = Number(textureStage.alphaArg2) >>> 0;
  return (d3dTextureCombinerOpUsesArg0(alphaOp) && (alphaArg0 & D3DTA_SELECTMASK) === base)
    || (d3dTextureCombinerOpUsesArg1(alphaOp) && (alphaArg1 & D3DTA_SELECTMASK) === base)
    || (d3dTextureCombinerOpUsesArg2(alphaOp) && (alphaArg2 & D3DTA_SELECTMASK) === base);
}

const D3D8_ALPHA_TEXTURE_CUTOUT_ELIGIBLE = 1;
const D3D8_ALPHA_TEXTURE_CUTOUT_INELIGIBLE = 2;

function d3d8TextureAlphaCutoutState(resource) {
  if (!d3d8TextureFormatHasAlpha(resource?.format)) {
    return 0;
  }
  return d3d8TextureSupportsImplicitAlphaCutout(resource)
    ? D3D8_ALPHA_TEXTURE_CUTOUT_ELIGIBLE
    : D3D8_ALPHA_TEXTURE_CUTOUT_INELIGIBLE;
}

function d3d8FinalAlphaTextureCutoutState(renderState, canSampleTexture0, texture0Resource,
    canSampleTexture1, texture1Resource) {
  const stage0 = renderState?.textureStages?.[0] ?? null;
  const stage1 = renderState?.textureStages?.[1] ?? null;
  const stage0TextureAlpha = canSampleTexture0 &&
    d3d8TextureStageAlphaUsesBase(stage0, D3DTA_TEXTURE)
    ? d3d8TextureAlphaCutoutState(texture0Resource)
    : 0;
  const stage0WritesTemp = (Number(stage0?.resultArg ?? D3DTA_CURRENT) >>> 0) === D3DTA_TEMP;
  const stage0CurrentAlpha = stage0WritesTemp ? 0 : stage0TextureAlpha;
  const stage0TempAlpha = stage0WritesTemp ? stage0TextureAlpha : 0;

  const stage1AlphaOp = Number(stage1?.alphaOp ?? D3DTOP_DISABLE) >>> 0;
  if (stage1AlphaOp === D3DTOP_DISABLE) {
    return stage0CurrentAlpha;
  }

  const stage1TextureAlpha = canSampleTexture1 &&
    d3d8TextureStageAlphaUsesBase(stage1, D3DTA_TEXTURE)
    ? d3d8TextureAlphaCutoutState(texture1Resource)
    : 0;
  return stage1TextureAlpha |
    (d3d8TextureStageAlphaUsesBase(stage1, D3DTA_CURRENT) ? stage0CurrentAlpha : 0) |
    (d3d8TextureStageAlphaUsesBase(stage1, D3DTA_TEMP) ? stage0TempAlpha : 0);
}

function d3d8ImplicitAlphaCutoutThreshold(renderState, canSampleTexture0, texture0Resource,
    canSampleTexture1, texture1Resource) {
  if (!renderState ||
      renderState.alphaTestEnable !== 0 ||
      renderState.alphaBlendEnable !== 0 ||
      renderState.zEnable === D3DZB_FALSE ||
      renderState.zWriteEnable === 0) {
    return -1;
  }
  const textureAlphaState = d3d8FinalAlphaTextureCutoutState(
    renderState,
    canSampleTexture0,
    texture0Resource,
    canSampleTexture1,
    texture1Resource,
  );

  // D3D8 does not discard texels while alpha testing is disabled. This
  // compatibility path exists only for shipped opaque passes whose mostly
  // opaque alpha masks contain isolated holes (the shell-map battleship). Do
  // not infer a cutout when zero alpha is the majority: some opaque materials,
  // including the Tech Reinforcement Pad tower, carry an auxiliary/unused
  // alpha channel that would otherwise erase most of the model.
  return textureAlphaState === D3D8_ALPHA_TEXTURE_CUTOUT_ELIGIBLE ? (1 / 255) : -1;
}

function d3d8TextureSemanticMode(resource) {
  switch (resource?.semantic) {
    case "alpha":
      return 1;
    case "luminance":
      return 2;
    case "luminanceAlpha":
      return 3;
    case "signedBump":
      return 4;
    default:
      return 0;
  }
}

function invalidateD3D8GlTextureBindingCache(stage = null) {
  d3d8CurrentActiveTextureUnit = null;
  if (stage === null || stage === undefined) {
    d3d8MaxCombinedTextureImageUnits = null;
    d3d8CurrentTexture2DBindings.clear();
    d3d8CurrentTexture3DBindings.clear();
    return;
  }
  const unit = Number(stage) >>> 0;
  d3d8CurrentTexture2DBindings.delete(unit);
  d3d8CurrentTexture3DBindings.delete(unit);
}

function setD3D8ActiveTextureUnitCached(stage) {
  const unit = Number(stage) >>> 0;
  if (d3d8CurrentActiveTextureUnit === unit) {
    if (d3d8PerfCountersEnabled) d3d8PerfStats.drawTextureActiveCacheHits += 1;
    return;
  }
  gl.activeTexture(gl.TEXTURE0 + unit);
  d3d8CurrentActiveTextureUnit = unit;
  if (d3d8PerfCountersEnabled) d3d8PerfStats.drawTextureActiveCacheMisses += 1;
}

function d3d8FeedbackSafeTextureResource(resource) {
  if (!gl || !resource?.texture || d3d8CurrentFramebuffer === null ||
      resource.id !== d3d8CurrentFramebufferColorTextureId) {
    return resource;
  }

  let snapshot = resource.feedbackSnapshot;
  if (!snapshot) {
    snapshot = {
      id: resource.id,
      width: resource.width,
      height: resource.height,
      levels: 1,
      format: resource.format,
      texture: gl.createTexture(),
      target: gl.TEXTURE_2D,
      type: "feedback-snapshot",
      completeMipChain: true,
      samplerState: null,
      samplerStateKey: null,
      samplerD3DStateKey: null,
      resolvedBindSerial: -1,
      renderTargetYFlipped: true,
    };
    withPreservedD3D8TextureUnit(() => {
      gl.bindTexture(gl.TEXTURE_2D, snapshot.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA8,
        snapshot.width,
        snapshot.height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null,
      );
    });
    resource.feedbackSnapshot = snapshot;
  }

  if (snapshot.resolvedBindSerial !== d3d8FramebufferBindSerial) {
    const startedAt = perfNow();
    withPreservedD3D8TextureUnit(() => {
      gl.bindTexture(gl.TEXTURE_2D, snapshot.texture);
      gl.copyTexSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        0,
        0,
        snapshot.width,
        snapshot.height,
      );
    });
    snapshot.resolvedBindSerial = d3d8FramebufferBindSerial;
    if (d3d8PerfCountersEnabled) d3d8PerfStats.framebufferFeedbackResolves += 1;
    if (d3d8PerfCountersEnabled) d3d8PerfStats.framebufferFeedbackResolveMs += perfNow() - startedAt;
  }
  return snapshot;
}

function bindD3D8DrawTexture2D(stage, resource) {
  if (!gl || !resource?.texture) {
    return;
  }
  const unit = Number(stage) >>> 0;
  setD3D8ActiveTextureUnitCached(unit);
  if (d3d8CurrentTexture2DBindings.get(unit) === resource.texture) {
    if (d3d8PerfCountersEnabled) d3d8PerfStats.drawTextureBindCacheHits += 1;
    return;
  }
  gl.bindTexture(gl.TEXTURE_2D, resource.texture);
  d3d8CurrentTexture2DBindings.set(unit, resource.texture);
  if (d3d8PerfCountersEnabled) d3d8PerfStats.drawTextureBindCacheMisses += 1;
}

function ensureD3D8DrawTexture2D(stage, textureStage, resource) {
  if (!gl || !resource?.texture || !textureStage) {
    return null;
  }
  const sampleResource = d3d8FeedbackSafeTextureResource(resource);
  const unit = Number(stage) >>> 0;
  const textureBound = d3d8CurrentTexture2DBindings.get(unit) === sampleResource.texture;
  const rawSamplerCurrent = d3d8TextureSamplerRawStateCurrent(textureStage, sampleResource);
  if (textureBound && rawSamplerCurrent) {
    if (d3d8PerfCountersEnabled) d3d8PerfStats.drawTextureBindCacheHits += 1;
    if (d3d8PerfCountersEnabled) d3d8PerfStats.drawTextureSamplerCacheHits += 1;
    return sampleResource.samplerState;
  }

  bindD3D8DrawTexture2D(unit, sampleResource);
  if (rawSamplerCurrent) {
    if (d3d8PerfCountersEnabled) d3d8PerfStats.drawTextureSamplerCacheHits += 1;
    return sampleResource.samplerState;
  }
  const samplerParams = d3d8TextureSamplerParams(textureStage, sampleResource);
  const samplerCurrent = d3d8TextureSamplerStateCurrent(textureStage, sampleResource, samplerParams);
  if (samplerCurrent) {
    if (d3d8PerfCountersEnabled) d3d8PerfStats.drawTextureSamplerCacheHits += 1;
    return sampleResource.samplerState;
  }
  if (d3d8PerfCountersEnabled) d3d8PerfStats.drawTextureSamplerCacheMisses += 1;
  return applyD3D8TextureSamplerToBoundTexture(unit, textureStage, sampleResource, samplerParams);
}

function withPreservedD3D8TextureBinding(target, callback) {
  if (!gl) {
    return null;
  }
  flushD3D8PendingDrawBatch("preserveTextureBinding");
  const previousActiveTexture = gl.getParameter(gl.ACTIVE_TEXTURE);
  gl.activeTexture(gl.TEXTURE0);
  const binding = target === gl.TEXTURE_3D ? gl.TEXTURE_BINDING_3D : gl.TEXTURE_BINDING_2D;
  const previousTexture = gl.getParameter(binding);
  try {
    return callback();
  } finally {
    gl.bindTexture(target, previousTexture);
    gl.activeTexture(previousActiveTexture);
    invalidateD3D8GlTextureBindingCache();
  }
}

function withPreservedD3D8TextureUnit(callback) {
  if (!gl) {
    return null;
  }
  return withPreservedD3D8TextureBinding(gl.TEXTURE_2D, callback);
}

function timedReadPixels(x, y, width, height, format, type, pixels) {
  flushD3D8PendingDrawBatch("readPixels");
  const startedAt = perfNow();
  gl.readPixels(x, y, width, height, format, type, pixels);
  if (d3d8PerfCountersEnabled) d3d8PerfStats.readPixels += 1;
  if (d3d8PerfCountersEnabled) d3d8PerfStats.readPixelsPixels += Math.max(0, Number(width ?? 0) * Number(height ?? 0));
  if (d3d8PerfCountersEnabled) d3d8PerfStats.readPixelsMs += perfNow() - startedAt;
}

function timedGlClear(bits) {
  const startedAt = perfNow();
  gl.clear(bits);
  if (d3d8PerfCountersEnabled) d3d8PerfStats.clears += 1;
  if (d3d8PerfCountersEnabled) d3d8PerfStats.clearMs += perfNow() - startedAt;
}

function sampleD3D8TexturePixel(resource, x, y) {
  if (!gl || !resource?.texture || (resource.target ?? gl.TEXTURE_2D) !== gl.TEXTURE_2D) {
    return null;
  }
  flushD3D8PendingDrawBatch("sampleTexturePixel");
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
    timedReadPixels(readX, readY, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    pixel = Array.from(pixels);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);
  gl.deleteFramebuffer(framebuffer);
  return pixel;
}

function sampleD3D8TextureProbe(resource) {
  if (!resource?.width || !resource?.height) {
    return null;
  }
  return {
    topLeft: sampleD3D8TexturePixel(resource, 0, 0),
    center: sampleD3D8TexturePixel(
      resource,
      Math.floor(resource.width / 2),
      Math.floor(resource.height / 2),
    ),
    bottomRight: sampleD3D8TexturePixel(resource, resource.width - 1, resource.height - 1),
  };
}

function sampleD3D8TextureCenter(textureId) {
  const id = Number(textureId ?? 0) >>> 0;
  const resource = d3d8Textures.get(id);
  if (!resource?.width || !resource?.height) {
    return null;
  }
  return sampleD3D8TexturePixel(
    resource,
    Math.floor(resource.width / 2),
    Math.floor(resource.height / 2),
  );
}

function updateD3D8TextureSummary(force = false) {
  d3d8TextureStats.live = d3d8Textures.size;
  const boundTextures = {};
  for (const [stage, textureId] of d3d8BoundTextures.entries()) {
    boundTextures[String(stage)] = textureId;
  }
  harnessState.graphics = {
    ...harnessState.graphics,
    browserFboIncompleteCount: browser_fbo_incomplete_count,
    browserFboCount: d3d8Framebuffers.size,
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
      dxtDecodes: d3d8TextureStats.dxtDecodes,
      live: d3d8TextureStats.live,
      browserFboCount: d3d8Framebuffers.size,
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
      lastOffscreenFboBind: d3d8TextureStats.lastOffscreenFboBind,
      lastTextureDepthFboBind: d3d8TextureStats.lastTextureDepthFboBind,
    },
    // Rebuilding the ~150-field perf summary on every texture op is the
    // expensive part of this publish; lite mode keeps the previous value
    // (snapshotState() and forced callers refresh it per query instead).
    d3d8Perf: force || d3d8DiagLevel === "full"
      ? d3d8PerfSummary()
      : (harnessState.graphics?.d3d8Perf ?? null),
  };
}

function updateD3D8TextureBindSummary() {
  if (d3d8DiagLevel === "full") {
    updateD3D8TextureSummary();
  }
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
    releaseD3D8FramebufferEntriesForTexture(id);
    if (existing.feedbackSnapshot?.texture) {
      gl.deleteTexture(existing.feedbackSnapshot.texture);
    }
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
    target: gl.TEXTURE_2D,
    type: "2d",
    depth: 1,
    initializedLevels: new Set(),
    levelFormats: new Map(),
    completeMipChain: false,
    uploads: 0,
    alphaCoverage: null,
    samplerState: null,
    samplerStateKey: null,
    samplerD3DStateKey: null,
    renderTargetYFlipped:
      ((Number(payload.usage ?? 0) >>> 0) & D3DUSAGE_RENDERTARGET) !== 0,
  };
  d3d8Textures.set(id, resource);
  // D3D8 semantics: a created texture bound to a stage is ALWAYS sampleable — it
  // samples whatever storage is in place even before the app writes content. The
  // bridge otherwise treats a texture whose level 0 has not been uploaded as
  // un-sampleable (canSampleTexture*), and the fragment shader substitutes opaque
  // WHITE for it (`vec4(1.0)`), turning any MODULATE-by-that-texture into a no-op.
  // A POOL_DEFAULT texture created with no content and filled later via
  // CopyRects/UpdateSurface — e.g. the W3DShroud fog-of-war texture that the tree
  // draw MODULATEs at STAGE 1 — is exactly this case: on any frame the engine
  // binds it before/without a captured level-0 upload, the shroud reads white and
  // the trees never darken in fog (while buildings, shrouded via a separate
  // already-updated pass, do). Allocate defined level-0 storage now and mark it
  // initialized so the texture samples defined (zeroed) storage the moment it is
  // bound, matching D3D8. Scoped to plain 2D textures in the DEFAULT pool that are
  // NOT render targets / depth-stencils (those keep their own rtAllocated path),
  // and harmless for textures that later receive real content (their update
  // re-uploads over level 0 via texSubImage2D).
  const poolDefaultBlittable =
    (resource.pool >>> 0) === 0 /* D3DPOOL_DEFAULT */ &&
    (resource.usage & (D3DUSAGE_RENDERTARGET | D3DUSAGE_DEPTHSTENCIL)) === 0 &&
    !resource.initializedLevels.has("0");
  if (poolDefaultBlittable) {
    const createInfo = d3d8TextureFormatInfo(format);
    if (createInfo.supported && !createInfo.compressed) {
      withPreservedD3D8TextureUnit(() => {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, createInfo.internalFormat,
          width, height, 0, createInfo.format, createInfo.type, null);
      });
      resource.initializedLevels.add("0");
      resource.levelFormats.set("0", createInfo.storage);
      resource.storage = createInfo.storage;
      updateD3D8TextureMipCompleteness(resource);
    }
  }
  d3d8TextureStats.creates += 1;
  d3d8TextureStats.lastCreate = {
    id,
    width,
    height,
    depth: resource.depth,
    levels,
    format,
    type: resource.type,
    usage: resource.usage,
    pool: resource.pool,
  };
  updateD3D8TextureSummary();
  return 1;
}

function d3d8FramebufferKey(colorTextureId, depthTextureId) {
  return `${Number(colorTextureId ?? 0) >>> 0}:${Number(depthTextureId ?? 0) >>> 0}`;
}

function deleteD3D8FramebufferEntry(key, entry) {
  if (!gl || !entry) {
    return;
  }
  if (d3d8CurrentFramebuffer === entry.fbo) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    d3d8CurrentFramebuffer = null;
    d3d8CurrentFramebufferWidth = 0;
    d3d8CurrentFramebufferHeight = 0;
    d3d8CurrentFramebufferColorTextureId = 0;
  }
  if (entry.fbo) {
    gl.deleteFramebuffer(entry.fbo);
  }
  if (entry.depthRenderbuffer) {
    gl.deleteRenderbuffer(entry.depthRenderbuffer);
  }
  d3d8Framebuffers.delete(key);
}

function releaseD3D8FramebufferEntriesForTexture(textureId) {
  const id = Number(textureId ?? 0) >>> 0;
  if (id === 0) {
    return;
  }
  for (const [key, entry] of Array.from(d3d8Framebuffers.entries())) {
    if (entry?.colorTextureId === id || entry?.depthTextureId === id) {
      deleteD3D8FramebufferEntry(key, entry);
    }
  }
}

function ensureD3D8DepthTextureStorage(resource) {
  if (!gl || !resource || (resource.target ?? gl.TEXTURE_2D) !== gl.TEXTURE_2D) {
    return null;
  }
  const info = d3d8DepthStencilFormatInfo(resource.format);
  if (!info.supported) {
    d3d8TextureStats.unsupportedUpdates += 1;
    d3d8TextureStats.lastUnsupported = {
      id: resource.id,
      format: resource.format,
      reason: info.reason,
    };
    updateD3D8TextureSummary();
    return null;
  }
  withPreservedD3D8TextureUnit(() => {
    gl.bindTexture(gl.TEXTURE_2D, resource.texture);
    if (!resource.rtAllocated || resource.storage !== info.storage) {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        info.internalFormat,
        resource.width,
        resource.height,
        0,
        info.format,
        info.type,
        null
      );
      resource.rtAllocated = true;
      resource.initializedLevels.add("0");
      resource.levelFormats.set("0", info.storage);
      updateD3D8TextureMipCompleteness(resource);
      resource.storage = info.storage;
    }
  });
  return info;
}

function bindD3D8Framebuffer(payload = {}) {
  // Reset state hash: framebuffer/viewport change outside the draw path.
  invalidateD3D8DrawStateCache();
  if (!gl) {
    return 0;
  }
  const bindStartedAt = perfNow();
  const finishFboBind = (result) => {
    if (d3d8PerfCountersEnabled) d3d8PerfStats.fboBinds += 1;
    if (d3d8PerfCountersEnabled) d3d8PerfStats.fboBindMs += perfNow() - bindStartedAt;
    if (d3d8PerfCountersEnabled) {
      d3d8PerfStats.fboIncomplete = browser_fbo_incomplete_count;
    }
    if (d3d8DiagLevel === "full") {
      harnessState.graphics.d3d8Perf = d3d8PerfSummary();
    }
    return result;
  };
  const colorTextureId = Number(payload.colorTextureId ?? 0) >>> 0;
  const depthTextureId = Number(payload.depthTextureId ?? 0) >>> 0;
  const width = Number(payload.width ?? 0) >>> 0;
  const height = Number(payload.height ?? 0) >>> 0;
  d3d8FramebufferBindSerial += 1;

  if (colorTextureId === 0) {
    // Bind backbuffer (default framebuffer)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    d3d8CurrentFramebuffer = null;
    d3d8CurrentFramebufferWidth = 0;
    d3d8CurrentFramebufferHeight = 0;
    d3d8CurrentFramebufferColorTextureId = 0;
    return finishFboBind(1);
  }

  const framebufferKey = d3d8FramebufferKey(colorTextureId, depthTextureId);
  let fboEntry = d3d8Framebuffers.get(framebufferKey);
  if (!fboEntry) {
    const colorTexture = d3d8Textures.get(colorTextureId);
    if (!colorTexture || !colorTexture.texture) {
      return finishFboBind(0);
    }
    let depthTexture = null;
    let depthInfo = null;
    if (depthTextureId !== 0) {
      depthTexture = d3d8Textures.get(depthTextureId);
      if (!depthTexture || !depthTexture.texture || !isD3D8DepthStencilTexture(depthTexture)) {
        d3d8TextureStats.unsupportedUpdates += 1;
        d3d8TextureStats.lastUnsupported = {
          id: depthTextureId,
          format: depthTexture?.format ?? 0,
          reason: "depth FBO attachment requires a D3DUSAGE_DEPTHSTENCIL 2D texture",
        };
        updateD3D8TextureSummary();
        return finishFboBind(0);
      }
      if (depthTexture.width < width || depthTexture.height < height) {
        d3d8TextureStats.unsupportedUpdates += 1;
        d3d8TextureStats.lastUnsupported = {
          id: depthTextureId,
          format: depthTexture.format,
          width: depthTexture.width,
          height: depthTexture.height,
          colorWidth: width,
          colorHeight: height,
          reason: "D3D8 depth-stencil surface is smaller than the render target",
        };
        updateD3D8TextureSummary();
        return finishFboBind(0);
      }
      depthInfo = ensureD3D8DepthTextureStorage(depthTexture);
      if (!depthInfo) {
        return finishFboBind(0);
      }
    }

    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

    // Ensure the color texture has allocated GL storage before FBO attach.
    // A texture created via createD3D8Texture has no storage until
    // updateD3D8Texture uploads pixel data; attaching a bare texture to an
    // FBO makes it INCOMPLETE and the renderer silently falls back to the
    // backbuffer, defeating RTT entirely.
    withPreservedD3D8TextureUnit(() => {
      gl.bindTexture(gl.TEXTURE_2D, colorTexture.texture);
      if (!colorTexture.rtAllocated) {
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          width,
          height,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          null
        );
        colorTexture.rtAllocated = true;
      }
    });

    // Attach color texture
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      colorTexture.texture,
      0
    );

    let depthRenderbuffer = null;
    let depthAttachment = "depth-renderbuffer";
    let depthStorage = "depth16";
    if (depthTextureId !== 0 && depthTexture && depthInfo) {
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        depthInfo.attachment,
        gl.TEXTURE_2D,
        depthTexture.texture,
        0
      );
      depthAttachment = "texture";
      depthStorage = depthInfo.storage;
    } else {
      depthRenderbuffer = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, depthRenderbuffer);
      if (d3d8HasStencilBuffer) {
        // The native D3D8 device exposes a D24S8 auto depth/stencil surface.
        // RTT callers that omit an explicit depth texture still expect the
        // matching implicit surface, including stencil for projected shadows.
        gl.renderbufferStorage(
          gl.RENDERBUFFER,
          gl.DEPTH24_STENCIL8,
          width,
          height
        );
        gl.framebufferRenderbuffer(
          gl.FRAMEBUFFER,
          gl.DEPTH_STENCIL_ATTACHMENT,
          gl.RENDERBUFFER,
          depthRenderbuffer
        );
        depthAttachment = "depth-stencil-renderbuffer";
        depthStorage = "depth24-stencil8";
      } else {
        gl.renderbufferStorage(
          gl.RENDERBUFFER,
          gl.DEPTH_COMPONENT16,
          width,
          height
        );
        gl.framebufferRenderbuffer(
          gl.FRAMEBUFFER,
          gl.DEPTH_ATTACHMENT,
          gl.RENDERBUFFER,
          depthRenderbuffer
        );
      }
    }

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      browser_fbo_incomplete_count += 1;
      const statusName = status === gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT
        ? "INCOMPLETE_ATTACHMENT"
        : status === gl.FRAMEBUFFER_MISSING_ATTACHMENT
          ? "MISSING_ATTACHMENT"
          : status === gl.FRAMEBUFFER_UNSUPPORTED
            ? "UNSUPPORTED"
            : "UNKNOWN";
      console.warn(
        `FBO incomplete for texture ${colorTextureId}: status ${statusName} (0x${status.toString(16)})`
      );
      gl.deleteFramebuffer(fbo);
      if (depthRenderbuffer) {
        gl.deleteRenderbuffer(depthRenderbuffer);
      }
      // Do NOT fall back to the default framebuffer — that would make offscreen
      // draws pollute the main color+depth buffer. Restore the previous
      // framebuffer instead.
      gl.bindFramebuffer(gl.FRAMEBUFFER, d3d8CurrentFramebuffer);
      return finishFboBind(0);
    }

    // A render-target allocation is valid level-0 texture storage, and every
    // successful scene pass writes it before the engine samples it. Keep the
    // normal texture-readiness bookkeeping in sync so post-processing and
    // heat-smudge draws do not substitute the fixed-function white fallback.
    colorTexture.initializedLevels.add("0");
    colorTexture.levelFormats.set("0", "rgba8");
    colorTexture.storage = "rgba8";
    updateD3D8TextureMipCompleteness(colorTexture);

    fboEntry = {
      fbo,
      colorTextureId,
      depthTextureId,
      depthRenderbuffer,
      depthAttachment,
      depthStorage,
      width,
      height,
    };
    d3d8Framebuffers.set(framebufferKey, fboEntry);
    if (d3d8PerfCountersEnabled) d3d8PerfStats.fboCreates += 1;
  } else {
    // FBO completeness is validated at creation. Texture release/recreation and
    // level-0 storage changes evict their cached attachments, so a cache hit can
    // bind directly without a synchronous GPU completeness query.
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboEntry.fbo);
  }

  // Set viewport to match RT size
  if (fboEntry.width !== d3d8CurrentFramebufferWidth ||
      fboEntry.height !== d3d8CurrentFramebufferHeight) {
    gl.viewport(0, 0, fboEntry.width, fboEntry.height);
    d3d8CurrentFramebufferWidth = fboEntry.width;
    d3d8CurrentFramebufferHeight = fboEntry.height;
  }

  d3d8CurrentFramebuffer = fboEntry.fbo;
  d3d8CurrentFramebufferColorTextureId = colorTextureId;
  const offscreenFboBind = {
    colorTextureId,
    depthTextureId,
    width,
    height,
    attachment: fboEntry.depthAttachment,
    storage: fboEntry.depthStorage,
  };
  const previousOffscreenFboBind = d3d8TextureStats.lastOffscreenFboBind;
  const offscreenFboChanged = previousOffscreenFboBind?.colorTextureId !== colorTextureId ||
    previousOffscreenFboBind?.depthTextureId !== depthTextureId ||
    previousOffscreenFboBind?.width !== width ||
    previousOffscreenFboBind?.height !== height ||
    previousOffscreenFboBind?.attachment !== fboEntry.depthAttachment ||
    previousOffscreenFboBind?.storage !== fboEntry.depthStorage;
  d3d8TextureStats.lastOffscreenFboBind = offscreenFboBind;
  if (depthTextureId !== 0) {
    d3d8TextureStats.lastTextureDepthFboBind = {
      ...offscreenFboBind,
    };
  }
  if (offscreenFboChanged || depthTextureId !== 0) {
    updateD3D8TextureSummary();
  }
  return finishFboBind(1);
}

function createD3D8VolumeTexture(payload = {}) {
  if (!gl) {
    return 0;
  }
  const id = Number(payload.id ?? 0) >>> 0;
  const width = Number(payload.width ?? 0) >>> 0;
  const height = Number(payload.height ?? 0) >>> 0;
  const depth = Number(payload.depth ?? 0) >>> 0;
  const levels = Math.max(1, Number(payload.levels ?? 1) >>> 0);
  const format = Number(payload.format ?? 0) >>> 0;
  if (id === 0 || width === 0 || height === 0 || depth === 0) {
    return 0;
  }

  const existing = d3d8Textures.get(id);
  if (existing) {
    releaseD3D8FramebufferEntriesForTexture(id);
    gl.deleteTexture(existing.texture);
  }

  const texture = gl.createTexture();
  withPreservedD3D8TextureBinding(gl.TEXTURE_3D, () => {
    gl.bindTexture(gl.TEXTURE_3D, texture);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
  });
  const resource = {
    id,
    width,
    height,
    depth,
    levels,
    format,
    usage: Number(payload.usage ?? 0) >>> 0,
    pool: Number(payload.pool ?? 0) >>> 0,
    texture,
    target: gl.TEXTURE_3D,
    type: "volume",
    initializedLevels: new Set(),
    levelFormats: new Map(),
    completeMipChain: false,
    uploads: 0,
    samplerState: null,
    samplerStateKey: null,
    samplerD3DStateKey: null,
  };
  d3d8Textures.set(id, resource);
  d3d8TextureStats.creates += 1;
  d3d8TextureStats.lastCreate = {
    id,
    width,
    height,
    depth,
    levels,
    format,
    type: resource.type,
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
  flushD3D8PendingDrawBatch("textureUpdate");
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
  if (!resource || (resource.target ?? gl.TEXTURE_2D) !== gl.TEXTURE_2D ||
      width === 0 || height === 0 || level >= resource.levels) {
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
  const level0AlphaCoverage = level !== 0
    ? undefined
    : (x === 0 && y === 0 && width === levelSize.width && height === levelSize.height
      ? d3d8TextureAlphaCoverage(format, payload.bytes, width, height)
      : null);

  const convertStartedAt = perfNow();
  // Handle DXT CPU decoding fallback
  let uploadBytes;
  if (info.dxtDecode) {
    // For DXT CPU path, we need to decode the entire level, not just the sub-rect
    // This is because DXT compression works on 4x4 blocks
    if (x !== 0 || y !== 0 || width !== levelSize.width || height !== levelSize.height) {
      // For sub-rect updates with DXT, decode the full level and extract the sub-rect
      const decodeStartedAt = perfNow();
      const fullLevelBytes = decodeDxtToRgba8(payload.bytes, levelSize.width, levelSize.height, info.dxtDecode);
      if (d3d8PerfCountersEnabled) d3d8PerfStats.dxtDecodeMs += perfNow() - decodeStartedAt;
      if (!fullLevelBytes) {
        d3d8TextureStats.unsupportedUpdates += 1;
        d3d8TextureStats.lastUnsupported = {
          id,
          level,
          format,
          reason: "DXT CPU decode failed for sub-rect update",
        };
        updateD3D8TextureSummary();
        return 0;
      }

      // Extract the sub-rect from the decoded full level
      const subRectBytes = new Uint8Array(width * height * 4);
      for (let sy = 0; sy < height; sy++) {
        for (let sx = 0; sx < width; sx++) {
          const srcOffset = ((y + sy) * levelSize.width + (x + sx)) * 4;
          const dstOffset = (sy * width + sx) * 4;
          subRectBytes[dstOffset] = fullLevelBytes[srcOffset];
          subRectBytes[dstOffset + 1] = fullLevelBytes[srcOffset + 1];
          subRectBytes[dstOffset + 2] = fullLevelBytes[srcOffset + 2];
          subRectBytes[dstOffset + 3] = fullLevelBytes[srcOffset + 3];
        }
      }
      uploadBytes = subRectBytes;
    } else {
      // Full level update - decode directly
      const decodeStartedAt = perfNow();
      uploadBytes = decodeDxtToRgba8(payload.bytes, width, height, info.dxtDecode);
      if (d3d8PerfCountersEnabled) d3d8PerfStats.dxtDecodeMs += perfNow() - decodeStartedAt;
      if (!uploadBytes) {
        d3d8TextureStats.unsupportedUpdates += 1;
        d3d8TextureStats.lastUnsupported = {
          id,
          level,
          format,
          reason: "DXT CPU decode failed",
        };
        updateD3D8TextureSummary();
        return 0;
      }
    }
  } else {
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
    uploadBytes = info.compressed ? convertedBytes : d3d8TextureUploadView(info, convertedBytes);
  }
  if (d3d8PerfCountersEnabled) d3d8PerfStats.textureConvertBytes += Number(payload.bytes.byteLength ?? 0) >>> 0;
  if (d3d8PerfCountersEnabled) d3d8PerfStats.textureConvertMs += perfNow() - convertStartedAt;
  const previousSemanticMode = d3d8TextureSemanticMode(resource);
  const previousAlphaCutoutState = d3d8TextureAlphaCutoutState(resource);
  resource.storage = info.storage;
  resource.semantic = info.semantic || null;
  const levelKey = String(level);
  const levelInitialized = resource.initializedLevels.has(levelKey);
  const levelFormat = resource.levelFormats.get(levelKey);
  const storageChanged = !levelInitialized || levelFormat !== info.storage;
  // An FBO stays complete across ordinary texSubImage2D writes. If an upload
  // actually changes level-0 storage, discard any cached attachment now so the
  // next SetRenderTarget recreates and validates it once. This makes a
  // synchronous checkFramebufferStatus on every render-target bind unnecessary.
  if (level === 0 && storageChanged) {
    releaseD3D8FramebufferEntriesForTexture(id);
  }
  let swizzleApplied = resource.swizzleApplied || null;
  const uploadStartedAt = perfNow();
  withPreservedD3D8TextureUnit(() => {
    gl.bindTexture(gl.TEXTURE_2D, resource.texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (storageChanged) {
      if (info.compressed && !info.dxtDecode) {
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
      updateD3D8TextureMipCompleteness(resource);
    } else {
      if (info.compressed && !info.dxtDecode) {
        gl.compressedTexImage2D(gl.TEXTURE_2D, level, info.internalFormat, width, height, 0, uploadBytes);
      } else {
        gl.texSubImage2D(gl.TEXTURE_2D, level, x, y, width, height, info.format, info.type, uploadBytes);
      }
    }
    swizzleApplied = applyD3D8TextureSwizzleIfChanged(resource, info);
  });
  if (d3d8PerfCountersEnabled) d3d8PerfStats.textureUploads += 1;
  if (d3d8PerfCountersEnabled) d3d8PerfStats.textureUploadBytes += Number(uploadBytes.byteLength ?? 0) >>> 0;
  if (d3d8PerfCountersEnabled) d3d8PerfStats.textureUploadPixels += Math.max(0, width * height);
  if (d3d8PerfCountersEnabled) d3d8PerfStats.textureUploadMs += perfNow() - uploadStartedAt;
  if (level0AlphaCoverage !== undefined) {
    resource.alphaCoverage = level0AlphaCoverage;
  }
  const derivedTextureStateChanged = !storageChanged &&
    (previousSemanticMode !== d3d8TextureSemanticMode(resource) ||
      previousAlphaCutoutState !== d3d8TextureAlphaCutoutState(resource));
  if (storageChanged) {
    // Allocating different storage can invalidate an attached framebuffer and
    // changes texture readiness, so retain the conservative full reset.
    invalidateD3D8DrawStateCache();
  } else if (derivedTextureStateChanged) {
    // texSubImage2D changes this texture's contents but preserves the current
    // program, render state, transforms, viewport, and vertex-array bindings.
    // If semantic or alpha-cutout metadata changed, retain those exact caches
    // and discard only derived entries whose decisions depend on this resource.
    invalidateD3D8TextureContentState(id);
  } else if (d3d8PerfCountersEnabled) {
    // Pixel contents do not participate in a derived-state key. Ordinary
    // same-storage uploads therefore leave every cached decision valid when
    // sampling readiness, semantic mode, and alpha-cutout eligibility match.
    d3d8PerfStats.drawTextureContentPreservations += 1;
  }

  resource.uploads += 1;
  d3d8TextureStats.updates += 1;
  let samplePixel = null;
  let legacySamplePixel = null;
  if (d3d8DiagLevel === "full" && level === 0 && !info.compressed) {
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
    aliasedStorage: info.aliasedStorage || null,
    premultipliedAlpha: Boolean(info.premultipliedAlpha),
    compressed: Boolean(info.compressed),
    blockBytes: Number(info.blockBytes ?? 0) >>> 0,
    semantic: info.semantic || null,
    alphaCoverage: resource.alphaCoverage,
    swizzle: swizzleApplied,
    pitch: Number(payload.pitch ?? 0) >>> 0,
    rowBytes: Number(payload.rowBytes ?? 0) >>> 0,
    byteSize: payload.bytes.byteLength,
    convertedByteSize: uploadBytes.byteLength,
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

function updateD3D8VolumeTexture(payload = {}) {
  if (!gl || !(payload.bytes instanceof Uint8Array)) {
    return 0;
  }
  flushD3D8PendingDrawBatch("volumeTextureUpdate");
  const id = Number(payload.id ?? 0) >>> 0;
  const level = Number(payload.level ?? 0) >>> 0;
  const x = Number(payload.x ?? 0) >>> 0;
  const y = Number(payload.y ?? 0) >>> 0;
  const z = Number(payload.z ?? 0) >>> 0;
  const width = Number(payload.width ?? 0) >>> 0;
  const height = Number(payload.height ?? 0) >>> 0;
  const depth = Number(payload.depth ?? 0) >>> 0;
  const format = Number(payload.format ?? 0) >>> 0;
  let resource = d3d8Textures.get(id);
  if (!resource) {
    if (!createD3D8VolumeTexture({
      id,
      width,
      height,
      depth,
      levels: level + 1,
      format,
      usage: payload.usage,
    })) {
      return 0;
    }
    resource = d3d8Textures.get(id);
  }
  if (!resource || resource.target !== gl.TEXTURE_3D ||
      width === 0 || height === 0 || depth === 0 || level >= resource.levels) {
    return 0;
  }

  const info = d3d8TextureFormatInfo(format);
  if (!info.supported) {
    d3d8TextureStats.unsupportedUpdates += 1;
    d3d8TextureStats.lastUnsupported = {
      id,
      level,
      format,
      type: resource.type,
      reason: info.reason,
    };
    updateD3D8TextureSummary();
    return 0;
  }
  if (info.compressed && !info.dxtDecode) {
    d3d8TextureStats.unsupportedUpdates += 1;
    d3d8TextureStats.lastUnsupported = {
      id,
      level,
      format,
      type: resource.type,
      reason: "compressed volume texture updates are not implemented",
    };
    updateD3D8TextureSummary();
    return 0;
  }

  // Handle DXT CPU decoding for volume textures
  if (info.dxtDecode) {
    // Volume DXT decoding is not implemented - reject for now
    d3d8TextureStats.unsupportedUpdates += 1;
    d3d8TextureStats.lastUnsupported = {
      id,
      level,
      format,
      type: resource.type,
      reason: "DXT CPU decode for volume textures not implemented",
    };
    updateD3D8TextureSummary();
    return 0;
  }

  const levelSize = d3d8TextureLevelSize(resource, level);
  if (x + width > levelSize.width || y + height > levelSize.height || z + depth > levelSize.depth) {
    return 0;
  }

  const convertStartedAt = perfNow();
  const convertedBytes = convertD3D8TextureBytes(format, payload.bytes, width, height, depth);
  const uploadBytes = d3d8TextureUploadView(info, convertedBytes);
  if (d3d8PerfCountersEnabled) d3d8PerfStats.textureConvertBytes += Number(payload.bytes.byteLength ?? 0) >>> 0;
  if (d3d8PerfCountersEnabled) d3d8PerfStats.textureConvertMs += perfNow() - convertStartedAt;
  resource.storage = info.storage;
  resource.semantic = info.semantic || null;
  const levelKey = String(level);
  const levelInitialized = resource.initializedLevels.has(levelKey);
  const levelFormat = resource.levelFormats.get(levelKey);
  let swizzleApplied = resource.swizzleApplied || null;
  const uploadStartedAt = perfNow();
  withPreservedD3D8TextureBinding(gl.TEXTURE_3D, () => {
    gl.bindTexture(gl.TEXTURE_3D, resource.texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (!levelInitialized || levelFormat !== info.storage) {
      if (x === 0 && y === 0 && z === 0 &&
          width === levelSize.width && height === levelSize.height && depth === levelSize.depth) {
        gl.texImage3D(gl.TEXTURE_3D, level, info.internalFormat, width, height, depth, 0,
          info.format, info.type, uploadBytes);
      } else {
        gl.texImage3D(gl.TEXTURE_3D, level, info.internalFormat,
          levelSize.width, levelSize.height, levelSize.depth, 0, info.format, info.type, null);
        gl.texSubImage3D(gl.TEXTURE_3D, level, x, y, z, width, height, depth,
          info.format, info.type, uploadBytes);
      }
      resource.initializedLevels.add(levelKey);
      resource.levelFormats.set(levelKey, info.storage);
      updateD3D8TextureMipCompleteness(resource);
    } else {
      gl.texSubImage3D(gl.TEXTURE_3D, level, x, y, z, width, height, depth,
        info.format, info.type, uploadBytes);
    }
    swizzleApplied = applyD3D8TextureSwizzleIfChanged(resource, info);
  });
  if (d3d8PerfCountersEnabled) d3d8PerfStats.textureUploads += 1;
  if (d3d8PerfCountersEnabled) d3d8PerfStats.volumeTextureUploads += 1;
  if (d3d8PerfCountersEnabled) d3d8PerfStats.textureUploadBytes += Number(uploadBytes.byteLength ?? 0) >>> 0;
  if (d3d8PerfCountersEnabled) d3d8PerfStats.textureUploadPixels += Math.max(0, width * height * depth);
  if (d3d8PerfCountersEnabled) d3d8PerfStats.textureUploadMs += perfNow() - uploadStartedAt;
  invalidateD3D8DrawStateCache();

  resource.uploads += 1;
  d3d8TextureStats.updates += 1;
  d3d8TextureStats.lastUpdate = {
    id,
    level,
    x,
    y,
    z,
    width,
    height,
    depth,
    format,
    storage: info.storage,
    type: resource.type,
    compressed: false,
    blockBytes: 0,
    semantic: info.semantic || null,
    swizzle: swizzleApplied,
    pitch: Number(payload.rowPitch ?? 0) >>> 0,
    rowPitch: Number(payload.rowPitch ?? 0) >>> 0,
    rowBytes: Number(payload.rowBytes ?? 0) >>> 0,
    slicePitch: Number(payload.slicePitch ?? 0) >>> 0,
    byteSize: payload.bytes.byteLength,
    convertedByteSize: convertedBytes.byteLength,
    usage: Number(payload.usage ?? 0) >>> 0,
    lockFlags: Number(payload.lockFlags ?? 0) >>> 0,
    uploads: resource.uploads,
    samplePixel: null,
    legacySamplePixel: null,
  };
  if (x !== 0 || y !== 0 || z !== 0 ||
      width !== levelSize.width || height !== levelSize.height || depth !== levelSize.depth) {
    d3d8TextureStats.lastSubrectUpdate = d3d8TextureStats.lastUpdate;
  }
  updateD3D8TextureSummary();
  return 1;
}

function releaseD3D8Texture(payload = {}) {
  if (!gl) {
    return 0;
  }
  flushD3D8PendingDrawBatch("textureRelease");
  const id = Number(payload.id ?? 0) >>> 0;
  const resource = d3d8Textures.get(id);
  if (!resource) {
    return 0;
  }
  const target = resource.target ?? gl.TEXTURE_2D;
  const releasedBindings = [];
  for (const [stage, textureId] of d3d8BoundTextures.entries()) {
    if (textureId === id) {
      const previousActiveTexture = gl.getParameter(gl.ACTIVE_TEXTURE);
      gl.activeTexture(gl.TEXTURE0 + stage);
      gl.bindTexture(target, null);
      gl.activeTexture(previousActiveTexture);
      d3d8CurrentActiveTextureUnit = null;
      d3d8CurrentTexture2DBindings.set(stage, null);
      d3d8CurrentTexture3DBindings.set(stage, null);
      d3d8BoundTextures.delete(stage);
      releasedBindings.push(stage);
    }
  }
  if (resource.feedbackSnapshot?.texture) {
    gl.deleteTexture(resource.feedbackSnapshot.texture);
  }
  gl.deleteTexture(resource.texture);
  invalidateD3D8GlTextureBindingCache();
  invalidateD3D8DrawStateCache();
  if (releasedBindings.length > 0) {
    d3d8TextureStats.releaseUnbinds += releasedBindings.length;
    d3d8TextureStats.lastReleaseUnbind = { id, stages: releasedBindings };
  }
  d3d8TextureStats.lastRelease = { id, type: resource.type || "2d", depth: resource.depth ?? 1, releasedBindings };
  releaseD3D8FramebufferEntriesForTexture(id);
  d3d8Textures.delete(id);
  d3d8TextureStats.releases += 1;
  updateD3D8TextureSummary();
  return 1;
}

function bindD3D8Texture(payload = {}) {
  if (!gl) {
    return 0;
  }
  const stage = Number(payload.stage ?? 0) >>> 0;
  const id = Number(payload.id ?? 0) >>> 0;
  const maxTextureUnits = d3d8MaxCombinedTextureImageUnits ??
    (d3d8MaxCombinedTextureImageUnits = gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS));
  if (stage >= maxTextureUnits) {
    d3d8TextureStats.missingBinds += 1;
    d3d8TextureStats.lastMissingBind = {
      stage,
      id,
      reason: "stage exceeds WebGL texture units",
      maxTextureUnits,
    };
    updateD3D8TextureBindSummary();
    return 0;
  }
  const previousId = Number(d3d8BoundTextures.get(stage) ?? 0) >>> 0;

  if (id === 0) {
    if (previousId !== 0) {
      flushD3D8PendingDrawBatch("textureBind");
    }
    d3d8BoundTextures.delete(stage);
    d3d8TextureStats.unbinds += 1;
    d3d8TextureStats.lastBind = {
      stage,
      id,
      ok: true,
      nullBind: true,
      boundTexture: null,
    };
    updateD3D8TextureBindSummary();
    return 1;
  }

  const resource = d3d8Textures.get(id);
  if (!resource) {
    d3d8TextureStats.missingBinds += 1;
    d3d8TextureStats.lastMissingBind = {
      stage,
      id,
      reason: "texture id is not live",
    };
    updateD3D8TextureBindSummary();
    return 0;
  }

  if (previousId !== id) {
    flushD3D8PendingDrawBatch("textureBind");
  }
  d3d8BoundTextures.set(stage, id);
  d3d8TextureStats.binds += 1;
  d3d8TextureStats.lastBind = {
    stage,
    id,
    ok: true,
    nullBind: false,
    width: resource.width,
    height: resource.height,
    depth: resource.depth ?? 1,
    levels: resource.levels,
    format: resource.format,
    type: resource.type || "2d",
    uploads: resource.uploads,
  };
  updateD3D8TextureBindSummary();
  return 1;
}

function sampleCanvasPixel(x = 0, y = 0) {
  const pixels = new Uint8Array(4);
  if (gl) {
    const readX = Math.max(0, Math.min(gl.drawingBufferWidth - 1, Math.trunc(x)));
    const readY = Math.max(0, Math.min(gl.drawingBufferHeight - 1, Math.trunc(y)));
    timedReadPixels(readX, gl.drawingBufferHeight - 1 - readY, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  } else if (fallbackContext) {
    const readX = Math.max(0, Math.min(canvas.width - 1, Math.trunc(x)));
    const readY = Math.max(0, Math.min(canvas.height - 1, Math.trunc(y)));
    pixels.set(fallbackContext.getImageData(readX, readY, 1, 1).data);
  }
  return Array.from(pixels);
}

function sampleVirtualCanvasPixel(x = 0, y = 0, virtualWidth = 800, virtualHeight = 600) {
  syncCanvasSize();
  const canvasWidth = gl ? gl.drawingBufferWidth : canvas.width;
  const canvasHeight = gl ? gl.drawingBufferHeight : canvas.height;
  return sampleCanvasPixel(
    Math.floor((Number(x) / virtualWidth) * canvasWidth),
    Math.floor((Number(y) / virtualHeight) * canvasHeight),
  );
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
    timedReadPixels(left, readY, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data);
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
  // Reset state hash: clear changes GL state outside the draw path.
  invalidateD3D8DrawStateCache();
  syncCanvasSize();
  if (gl) {
    gl.clearColor(rgba[0] / 255, rgba[1] / 255, rgba[2] / 255, rgba[3] / 255);
    gl.clearDepth(1);
    // D3D8's Clear ignores the depth/stencil write masks, but WebGL's
    // gl.clear RESPECTS gl.depthMask: if a prior draw left depth writes
    // disabled, the depth clear is silently skipped, leaving stale depth
    // that later geometry fails the depth test against (same class as the
    // black-terrain bug fixed in 08a1839). Force the depth write mask on
    // for the clear, then restore it.
    const restoreDepthMask = !d3d8CurrentDepthMask;
    if (restoreDepthMask) {
      setD3D8DepthMask(true);
    }
    timedGlClear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (restoreDepthMask) {
      setD3D8DepthMask(false);
    }
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
  const clearTotalStartedAt = perfNow();
  // Clear only touches clearColor/clearDepth/clearStencil (untracked), the
  // depth mask (via the tracked setD3D8DepthMask, restored below), the
  // stencil mask (tracked cache synced below), and — through syncCanvasSize's
  // restoreFullRenderTargetViewport — viewport/scissor, whose applied-viewport cache
  // that helper invalidates itself. The blend/cull/uniform/vertex-attrib
  // caches all stay valid, so only the pending batch needs flushing here
  // (it must draw under the pre-clear state).
  const invalidateStartedAt = perfNow();
  flushD3D8PendingDrawBatch("clear");
  if (d3d8PerfCountersEnabled) d3d8PerfStats.clearInvalidateMs += perfNow() - invalidateStartedAt;
  const clearFlags = flags >>> 0;
  const rgba = [
    clampColorByte(red, 0),
    clampColorByte(green, 0),
    clampColorByte(blue, 0),
    clampColorByte(alpha, 255),
  ];
  const syncStartedAt = perfNow();
  syncCanvasSize();
  if (d3d8PerfCountersEnabled) d3d8PerfStats.clearSyncCanvasMs += perfNow() - syncStartedAt;
  if (gl) {
    const setupStartedAt = perfNow();
    let clearBits = 0;
    if ((clearFlags & 0x1) !== 0) {
      gl.clearColor(rgba[0] / 255, rgba[1] / 255, rgba[2] / 255, rgba[3] / 255);
      clearBits |= gl.COLOR_BUFFER_BIT;
    }
    if ((clearFlags & 0x2) !== 0) {
      gl.clearDepth(Number(z));
      clearBits |= gl.DEPTH_BUFFER_BIT;
    }
    let hasStencilBuffer = false;
    if ((clearFlags & 0x4) !== 0) {
      const contextAttrStartedAt = perfNow();
      hasStencilBuffer = Boolean(gl.getContextAttributes()?.stencil);
      if (d3d8PerfCountersEnabled) d3d8PerfStats.clearContextAttrMs += perfNow() - contextAttrStartedAt;
    }
    if ((clearFlags & 0x4) !== 0 && hasStencilBuffer) {
      const clearStencilMask = d3d8EffectiveStencilValue(0xffffffff);
      gl.stencilMask(clearStencilMask);
      // stencilMask is a tracked render-state key; keep the cache in sync so
      // the next draw's tracked apply doesn't skip a needed gl.stencilMask.
      if (d3d8CurrentRenderGlState) {
        d3d8CurrentRenderGlState.stencilMask = clearStencilMask;
      }
      gl.clearStencil(d3d8EffectiveStencilValue(stencil));
      clearBits |= gl.STENCIL_BUFFER_BIT;
    }
    if (d3d8PerfCountersEnabled) d3d8PerfStats.clearSetupMs += perfNow() - setupStartedAt;
    if (clearBits !== 0) {
      // D3D8 Clear writes every component selected by its flags regardless of
      // the draw write masks. WebGL clear obeys colorMask/depthMask/stencilMask.
      // The terrain intentionally disables alpha writes after producing the
      // soft-water shoreline mask, so failing to override colorMask here leaves
      // stale screen-space alpha sectors that make water disappear as the
      // camera moves. Force the affected masks on, then restore draw state.
      const restoreColorMask = (clearBits & gl.COLOR_BUFFER_BIT) !== 0 &&
        d3d8CurrentColorMask.some((enabled) => !enabled);
      const previousColorMask = restoreColorMask ? d3d8CurrentColorMask : null;
      const depthMaskCheckStartedAt = perfNow();
      const restoreDepthMask =
        (clearBits & gl.DEPTH_BUFFER_BIT) !== 0 && !d3d8CurrentDepthMask;
      if (d3d8PerfCountersEnabled) d3d8PerfStats.clearDepthMaskCheckMs += perfNow() - depthMaskCheckStartedAt;
      if (restoreColorMask) {
        setD3D8ColorMask(true, true, true, true);
      }
      if (restoreDepthMask) {
        const depthMaskToggleStartedAt = perfNow();
        setD3D8DepthMask(true);
        if (d3d8PerfCountersEnabled) d3d8PerfStats.clearDepthMaskToggleMs += perfNow() - depthMaskToggleStartedAt;
      }
      timedGlClear(clearBits);
      if (previousColorMask) {
        setD3D8ColorMask(
          previousColorMask[0], previousColorMask[1],
          previousColorMask[2], previousColorMask[3]);
      }
      if (restoreDepthMask) {
        const depthMaskToggleStartedAt = perfNow();
        setD3D8DepthMask(false);
        if (d3d8PerfCountersEnabled) d3d8PerfStats.clearDepthMaskToggleMs += perfNow() - depthMaskToggleStartedAt;
      }
    }
  } else if (fallbackContext && (clearFlags & 0x1) !== 0) {
    fallbackContext.fillStyle = `rgb(${rgba[0]} ${rgba[1]} ${rgba[2]})`;
    fallbackContext.fillRect(0, 0, canvas.width, canvas.height);
  }
  if (d3d8DiagLevel !== "full") {
    if (d3d8PerfCountersEnabled) d3d8PerfStats.clearTotalMs += perfNow() - clearTotalStartedAt;
    return 1; // lite: skip the post-clear readPixels + probe
  }
  const postDiagStartedAt = perfNow();
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
  if (d3d8PerfCountersEnabled) d3d8PerfStats.clearPostDiagMs += perfNow() - postDiagStartedAt;
  if (d3d8PerfCountersEnabled) d3d8PerfStats.clearTotalMs += perfNow() - clearTotalStartedAt;
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

  const vertexSource = `#version 300 es
    in vec4 aPosition;
    in vec3 aNormal;
    in vec4 aDiffuseBgra;
    in vec4 aSpecularBgra;
    in vec2 aTexCoord0;
    in vec2 aTexCoord1;
    uniform float uScale;
    uniform bool uUseTransforms;
    uniform bool uPretransformedPosition;
    uniform vec4 uD3DViewport;
    uniform mat4 uWorld;
    uniform mat4 uView;
    uniform mat4 uProjection;
    uniform float uDepthBias;
    uniform int uTexture0CoordinateMode;
    uniform bool uUseTexture0Transform;
    uniform mat4 uTexture0Transform;
    uniform int uTexture0TransformComponentCount;
    uniform bool uTexture0TransformProjected;
    uniform int uTexture1CoordinateMode;
    uniform bool uUseTexture1Transform;
    uniform mat4 uTexture1Transform;
    uniform int uTexture1TransformComponentCount;
    uniform bool uTexture1TransformProjected;
    uniform int uTexture2CoordinateMode;
    uniform int uTexture2CoordSet;
    uniform bool uUseTexture2Transform;
    uniform mat4 uTexture2Transform;
    uniform int uTexture2TransformComponentCount;
    uniform bool uTexture2TransformProjected;
    uniform int uTexture3CoordinateMode;
    uniform int uTexture3CoordSet;
    uniform bool uUseTexture3Transform;
    uniform mat4 uTexture3Transform;
    uniform int uTexture3TransformComponentCount;
    uniform bool uTexture3TransformProjected;
    uniform float uPointSize;
    uniform float uPointSizeMin;
    uniform float uPointSizeMax;
    uniform bool uPointScaleEnable;
    uniform float uPointScaleA;
    uniform float uPointScaleB;
    uniform float uPointScaleC;
    uniform float uPointViewportHeight;
    uniform bool uLightingEnabled;
    uniform bool uSpecularEnabled;
    uniform bool uNormalizeNormals;
    uniform bool uLocalViewer;
    uniform bool uColorVertexEnabled;
    uniform vec4 uSceneAmbient;
    uniform vec4 uMaterialDiffuse;
    uniform vec4 uMaterialAmbient;
    uniform vec4 uMaterialSpecular;
    uniform vec4 uMaterialEmissive;
    uniform float uMaterialPower;
    uniform int uDiffuseMaterialSource;
    uniform int uSpecularMaterialSource;
    uniform int uAmbientMaterialSource;
    uniform int uEmissiveMaterialSource;
    uniform int uFixedLightCount;
    uniform int uFixedLightType[${D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT}];
    uniform vec4 uFixedLightDiffuse[${D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT}];
    uniform vec4 uFixedLightSpecular[${D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT}];
    uniform vec4 uFixedLightAmbient[${D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT}];
    uniform vec3 uFixedLightPosition[${D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT}];
    uniform vec3 uFixedLightDirection[${D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT}];
    uniform vec4 uFixedLightRangeAttenuation[${D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT}];
    uniform vec3 uFixedLightSpot[${D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT}];
    // Fog-of-war shroud UV generation for the tree draw (Trees.nvv fallback).
    // The tree FVF (XYZNDUV1) has no stage-1 UVs, so when uTreeShroudGen is set
    // the stage-1 texcoord is generated from world position: (worldXY + off)*scl.
    uniform bool uTreeShroudGen;
    uniform vec2 uTreeShroudOffset;
    uniform vec2 uTreeShroudScale;
    out vec4 vColor;
    out vec4 vSpecularColor;
    flat out vec4 vFlatColor;
    out vec2 vTexCoord0;
    out vec2 vTexCoord1;
    out vec2 vTexCoord2;
    out vec2 vTexCoord3;
    out vec4 vClipPosition;
    out float vFogDepth;
    out float vFogRangeDistance;
    vec4 d3dMaterialSourceColor(int source, vec4 materialColor, vec4 color1, vec4 color2) {
      if (!uColorVertexEnabled) {
        return materialColor;
      }
      if (source == 1) {
        return color1;
      }
      if (source == 2) {
        return color2;
      }
      return materialColor;
    }
    float d3dLightAttenuation(int index, float distanceToLight) {
      vec4 rangeAttenuation = uFixedLightRangeAttenuation[index];
      float range = rangeAttenuation.x;
      if (range > 0.0 && distanceToLight > range) {
        return 0.0;
      }
      float denominator =
        rangeAttenuation.y +
        rangeAttenuation.z * distanceToLight +
        rangeAttenuation.w * distanceToLight * distanceToLight;
      if (denominator <= 0.000001) {
        return 1.0;
      }
      return 1.0 / denominator;
    }
    float d3dSpotEffect(int index, vec3 lightDirection) {
      if (uFixedLightType[index] != 2) {
        return 1.0;
      }
      vec3 spotDirectionSource = uFixedLightDirection[index];
      vec3 spotDirection = length(spotDirectionSource) > 0.000001
        ? normalize(spotDirectionSource)
        : vec3(0.0, 0.0, -1.0);
      float rho = dot(spotDirection, -lightDirection);
      vec3 spot = uFixedLightSpot[index];
      float cosTheta = cos(max(spot.x, 0.0) * 0.5);
      float cosPhi = cos(max(spot.y, spot.x) * 0.5);
      if (rho <= cosPhi) {
        return 0.0;
      }
      if (rho >= cosTheta || abs(cosTheta - cosPhi) < 0.000001) {
        return 1.0;
      }
      float coneAmount = clamp((rho - cosPhi) / (cosTheta - cosPhi), 0.0, 1.0);
      float falloff = max(spot.z, 0.0);
      return falloff == 0.0 ? 1.0 : pow(coneAmount, falloff);
    }
    vec4 d3dApplyLighting(vec4 color1, vec4 color2, vec3 worldPosition, vec3 normal, vec3 viewDirection) {
      vec4 diffuseMaterial = d3dMaterialSourceColor(uDiffuseMaterialSource, uMaterialDiffuse, color1, color2);
      vec4 specularMaterial = d3dMaterialSourceColor(uSpecularMaterialSource, uMaterialSpecular, color1, color2);
      vec4 ambientMaterial = d3dMaterialSourceColor(uAmbientMaterialSource, uMaterialAmbient, color1, color2);
      vec4 emissiveMaterial = d3dMaterialSourceColor(uEmissiveMaterialSource, uMaterialEmissive, color1, color2);
      vec3 litRgb = emissiveMaterial.rgb + ambientMaterial.rgb * uSceneAmbient.rgb;
      vec3 effectiveNormal = uNormalizeNormals
        ? (length(normal) > 0.000001 ? normalize(normal) : vec3(0.0, 0.0, 1.0))
        : normal;
      if (length(effectiveNormal) <= 0.000001) {
        effectiveNormal = vec3(0.0, 0.0, 1.0);
      }
      vec3 unitViewDirection = length(viewDirection) > 0.000001
        ? normalize(viewDirection)
        : vec3(0.0, 0.0, 1.0);
      for (int index = 0; index < ${D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT}; ++index) {
        if (index >= uFixedLightCount) {
          break;
        }
        vec3 lightVector = uFixedLightType[index] == 3
          ? -uFixedLightDirection[index]
          : uFixedLightPosition[index] - worldPosition;
        float distanceToLight = length(lightVector);
        vec3 lightDirection = distanceToLight > 0.000001 ? normalize(lightVector) : effectiveNormal;
        float attenuation = uFixedLightType[index] == 3
          ? 1.0
          : d3dLightAttenuation(index, distanceToLight) * d3dSpotEffect(index, lightDirection);
        float diffuseAmount = max(dot(effectiveNormal, lightDirection), 0.0);
        litRgb += ambientMaterial.rgb * uFixedLightAmbient[index].rgb * attenuation;
        litRgb += diffuseMaterial.rgb * uFixedLightDiffuse[index].rgb * diffuseAmount * attenuation;
        if (uSpecularEnabled && diffuseAmount > 0.0 && attenuation > 0.0) {
          vec3 halfSource = lightDirection + unitViewDirection;
          vec3 halfVector = length(halfSource) > 0.000001 ? normalize(halfSource) : effectiveNormal;
          float specularDot = max(dot(effectiveNormal, halfVector), 0.0);
          float specularPower = max(uMaterialPower, 0.0);
          float specularAmount = specularPower == 0.0 ? 1.0 : pow(specularDot, specularPower);
          litRgb += specularMaterial.rgb * uFixedLightSpecular[index].rgb * specularAmount * attenuation;
        }
      }
      return vec4(clamp(litRgb, 0.0, 1.0), diffuseMaterial.a);
    }
    vec4 d3dTextureCoordinateSource(
      vec2 texCoord,
      int coordinateMode,
      vec3 cameraSpacePosition,
      vec3 cameraSpaceNormal) {
      if (coordinateMode == ${D3DTSS_TCI_CAMERASPACENORMAL}) {
        vec3 normal = length(cameraSpaceNormal) > 0.000001
          ? normalize(cameraSpaceNormal)
          : vec3(0.0, 0.0, 1.0);
        return vec4(normal, 1.0);
      }
      if (coordinateMode == ${D3DTSS_TCI_CAMERASPACEPOSITION}) {
        return vec4(cameraSpacePosition, 1.0);
      }
      if (coordinateMode == ${D3DTSS_TCI_CAMERASPACEREFLECTIONVECTOR}) {
        vec3 normal = length(cameraSpaceNormal) > 0.000001
          ? normalize(cameraSpaceNormal)
          : vec3(0.0, 0.0, 1.0);
        vec3 incident = length(cameraSpacePosition) > 0.000001
          ? normalize(cameraSpacePosition)
          : vec3(0.0, 0.0, 1.0);
        return vec4(reflect(incident, normal), 1.0);
      }
      return vec4(texCoord, 0.0, 1.0);
    }
    vec2 d3dApplyTextureTransform(vec4 texCoord, mat4 transformMatrix, int componentCount, bool projected) {
      vec4 transformed = transformMatrix * texCoord;
      if (projected) {
        float divisor = componentCount == 4 ? transformed.w : transformed.z;
        if (abs(divisor) > 0.000001) {
          return transformed.xy / divisor;
        }
      }
      return transformed.xy;
    }
    vec4 d3dPretransformedPositionToClip(vec4 screenPosition) {
      vec2 viewportOrigin = uD3DViewport.xy;
      vec2 viewportSize = max(uD3DViewport.zw, vec2(1.0));
      // D3D8 rasterizes XYZRHW coordinates at integer pixel centers. WebGL
      // uses half-integer centers, so translate by half a pixel while mapping
      // to clip space. This makes the engine's -0.5 fullscreen quads land on
      // exact texel centers instead of bilinearly blurring the scene copy.
      vec2 webGlPosition = screenPosition.xy + vec2(0.5);
      vec3 ndc = vec3(
        ((webGlPosition.x - viewportOrigin.x) / viewportSize.x) * 2.0 - 1.0,
        1.0 - ((webGlPosition.y - viewportOrigin.y) / viewportSize.y) * 2.0,
        screenPosition.z * 2.0 - 1.0
      );
      float rhw = abs(screenPosition.w) > 0.000001 ? screenPosition.w : 1.0;
      float clipW = 1.0 / rhw;
      return vec4(ndc * clipW, clipW);
    }
    void main() {
      vec4 worldPosition = vec4(aPosition.xyz, 1.0);
      vec4 viewPosition = worldPosition;
      vec3 worldNormal = aNormal;
      vec3 cameraSpaceNormal = aNormal;
      vec3 viewDirection = vec3(0.0, 0.0, 1.0);
      if (uPretransformedPosition) {
        gl_Position = d3dPretransformedPositionToClip(aPosition);
        vFogDepth = 0.0;
        vFogRangeDistance = 0.0;
      } else if (uUseTransforms) {
        worldPosition = uWorld * vec4(aPosition.xyz, 1.0);
        mat3 worldNormalMatrix = transpose(inverse(mat3(uWorld)));
        worldNormal = worldNormalMatrix * aNormal;
        viewPosition = uView * worldPosition;
        cameraSpaceNormal = mat3(uView) * worldNormal;
        vec4 cameraWorld = inverse(uView) * vec4(0.0, 0.0, 0.0, 1.0);
        vec3 cameraPosition = cameraWorld.xyz / max(abs(cameraWorld.w), 0.000001);
        vec4 cameraForwardWorld = inverse(uView) * vec4(0.0, 0.0, 1.0, 0.0);
        vec3 orthogonalViewDirection = length(cameraForwardWorld.xyz) > 0.000001
          ? normalize(cameraForwardWorld.xyz)
          : viewDirection;
        vec3 worldToCamera = cameraPosition - worldPosition.xyz;
        vec3 localViewDirection = length(worldToCamera) > 0.000001
          ? normalize(worldToCamera)
          : orthogonalViewDirection;
        viewDirection = uLocalViewer ? localViewDirection : orthogonalViewDirection;
        vec4 d3dClip = uProjection * viewPosition;
        gl_Position = vec4(d3dClip.x, d3dClip.y, d3dClip.z * 2.0 - d3dClip.w, d3dClip.w);
        vFogDepth = max(viewPosition.z, 0.0);
        vFogRangeDistance = length(viewPosition.xyz);
      } else {
        gl_Position = vec4(aPosition.x / uScale, aPosition.y / uScale, 0.0, 1.0);
        vFogDepth = 0.0;
        vFogRangeDistance = 0.0;
      }
      gl_Position.z -= uDepthBias * gl_Position.w;
      float d3dPointSize = max(uPointSize, 0.0);
      if (uPointScaleEnable) {
        float eyeDistance = max(length(viewPosition.xyz), 0.000001);
        float attenuation = max(
          uPointScaleA + uPointScaleB * eyeDistance + uPointScaleC * eyeDistance * eyeDistance,
          0.000001);
        d3dPointSize = max(uPointViewportHeight, 1.0) * d3dPointSize * inversesqrt(attenuation);
      }
      float d3dPointSizeMin = max(uPointSizeMin, 0.0);
      float d3dPointSizeMax = max(uPointSizeMax, d3dPointSizeMin);
      gl_PointSize = clamp(d3dPointSize, d3dPointSizeMin, d3dPointSizeMax);
      vClipPosition = worldPosition;
      vec4 color1 = vec4(aDiffuseBgra.b, aDiffuseBgra.g, aDiffuseBgra.r, aDiffuseBgra.a);
      vec4 color2 = vec4(aSpecularBgra.b, aSpecularBgra.g, aSpecularBgra.r, aSpecularBgra.a);
      vSpecularColor = color2;
      vColor = uLightingEnabled ? d3dApplyLighting(color1, color2, worldPosition.xyz, worldNormal, viewDirection) : color1;
      vFlatColor = vColor;
      vec4 texture0Coordinate = d3dTextureCoordinateSource(
        aTexCoord0,
        uTexture0CoordinateMode,
        viewPosition.xyz,
        cameraSpaceNormal);
      if (uUseTexture0Transform) {
        vTexCoord0 = d3dApplyTextureTransform(
          texture0Coordinate,
          uTexture0Transform,
          uTexture0TransformComponentCount,
          uTexture0TransformProjected);
      } else {
        vTexCoord0 = texture0Coordinate.xy;
      }
      vec4 texture1Coordinate = d3dTextureCoordinateSource(
        aTexCoord1,
        uTexture1CoordinateMode,
        viewPosition.xyz,
        cameraSpaceNormal);
      if (uTreeShroudGen) {
        // Trees.nvv: oT1 = (v0 + c32) * c33, per-vertex from world position.
        vTexCoord1 = (worldPosition.xy + uTreeShroudOffset) * uTreeShroudScale;
      } else if (uUseTexture1Transform) {
        vTexCoord1 = d3dApplyTextureTransform(
          texture1Coordinate,
          uTexture1Transform,
          uTexture1TransformComponentCount,
          uTexture1TransformProjected);
      } else {
        vTexCoord1 = texture1Coordinate.xy;
      }
      // Stages 2/3 either read a generated camera-space coord (the terrain/water
      // noise + lightmap layers use D3DTSS_TCI_CAMERASPACEPOSITION) or reuse an
      // existing vertex UV set selected by D3DTSS_TEXCOORDINDEX (coordSet 0/1,
      // the only sets the XYZNDUV FVF exposes). uTextureNCoordSet picks the base
      // UV; the transform (STRETCH_FACTOR noise projection etc.) is then applied.
      vec2 texCoord2Base = uTexture2CoordSet == 1 ? aTexCoord1 : aTexCoord0;
      vec4 texture2Coordinate = d3dTextureCoordinateSource(
        texCoord2Base,
        uTexture2CoordinateMode,
        viewPosition.xyz,
        cameraSpaceNormal);
      if (uUseTexture2Transform) {
        vTexCoord2 = d3dApplyTextureTransform(
          texture2Coordinate,
          uTexture2Transform,
          uTexture2TransformComponentCount,
          uTexture2TransformProjected);
      } else {
        vTexCoord2 = texture2Coordinate.xy;
      }
      vec2 texCoord3Base = uTexture3CoordSet == 1 ? aTexCoord1 : aTexCoord0;
      vec4 texture3Coordinate = d3dTextureCoordinateSource(
        texCoord3Base,
        uTexture3CoordinateMode,
        viewPosition.xyz,
        cameraSpaceNormal);
      if (uUseTexture3Transform) {
        vTexCoord3 = d3dApplyTextureTransform(
          texture3Coordinate,
          uTexture3Transform,
          uTexture3TransformComponentCount,
          uTexture3TransformProjected);
      } else {
        vTexCoord3 = texture3Coordinate.xy;
      }
    }
  `;
  // Stashed so translated-shader pair programs (see
  // ensureD3D8ShaderPairProgram) can link the exact same fixed-function
  // vertex stage against a translated SM1 fragment stage.
  d3d8FFVertexSourceCache = vertexSource;
  const vertexShader = compileShader(gl.VERTEX_SHADER, vertexSource);
  const fragmentSource = `#version 300 es
    precision highp float;
    in vec4 vColor;
    in vec4 vSpecularColor;
    flat in vec4 vFlatColor;
    in vec2 vTexCoord0;
    in vec2 vTexCoord1;
    in vec2 vTexCoord2;
    in vec2 vTexCoord3;
    in vec4 vClipPosition;
    in float vFogDepth;
    in float vFogRangeDistance;
    uniform int uClipPlaneMask;
    uniform vec4 uClipPlanes[6];
    uniform bool uUseFlatShade;
    uniform bool uDrawingPoints;
    uniform bool uPointSpriteEnable;
    uniform bool uUseTexture0;
    uniform sampler2D uTexture0;
    uniform float uTexture0LodBias;
    uniform int uTexture0Semantic;
    uniform bool uTexture0FlipY;
    uniform bool uUseTexture1;
    uniform sampler2D uTexture1;
    uniform float uTexture1LodBias;
    uniform int uTexture1Semantic;
    uniform bool uTexture1FlipY;
    uniform bool uUseTexture2;
    uniform sampler2D uTexture2;
    uniform float uTexture2LodBias;
    uniform int uTexture2Semantic;
    uniform bool uTexture2FlipY;
    uniform bool uUseTexture3;
    uniform sampler2D uTexture3;
    uniform float uTexture3LodBias;
    uniform int uTexture3Semantic;
    uniform bool uTexture3FlipY;
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
    uniform int uStage1AlphaOp;
    uniform int uStage1AlphaArg0;
    uniform int uStage1AlphaArg1;
    uniform int uStage1AlphaArg2;
    uniform int uStage1ResultArg;
    uniform int uStage2ColorOp;
    uniform int uStage2ColorArg0;
    uniform int uStage2ColorArg1;
    uniform int uStage2ColorArg2;
    uniform int uStage2AlphaOp;
    uniform int uStage2AlphaArg0;
    uniform int uStage2AlphaArg1;
    uniform int uStage2AlphaArg2;
    uniform int uStage2ResultArg;
    uniform int uStage3ColorOp;
    uniform int uStage3ColorArg0;
    uniform int uStage3ColorArg1;
    uniform int uStage3ColorArg2;
    uniform int uStage3AlphaOp;
    uniform int uStage3AlphaArg0;
    uniform int uStage3AlphaArg1;
    uniform int uStage3AlphaArg2;
    uniform int uStage3ResultArg;
    uniform bool uAlphaTestEnabled;
    uniform int uAlphaFunc;
    uniform float uAlphaRef;
    uniform float uImplicitAlphaCutoutThreshold;
    uniform bool uFogEnabled;
    uniform bool uFogRangeEnabled;
    uniform vec3 uFogColor;
    uniform float uFogStart;
    uniform float uFogEnd;
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
      if (semantic == 4) {
        vec2 signedBump = clamp((rawSample.rg * 255.0 - 128.0) / 127.0, -1.0, 1.0);
        return vec4(signedBump, 0.0, 1.0);
      }
      return rawSample;
    }
    vec2 d3dTextureCoordinate(vec2 coordinate, bool flipY) {
      return flipY ? vec2(coordinate.x, 1.0 - coordinate.y) : coordinate;
    }
    // D3DTA_DIFFUSE == 0, D3DTA_CURRENT == 1, D3DTA_TEXTURE == 2,
    // D3DTA_TFACTOR == 3, D3DTA_SPECULAR == 4, D3DTA_TEMP == 5.
    // D3DTA_COMPLEMENT == 0x10, D3DTA_ALPHAREPLICATE == 0x20.
    vec4 d3dCombinerSource(int arg, vec4 textureColor, vec4 currentColor, vec4 diffuseColor,
        vec4 specularColor, vec4 tempColor) {
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
      if (source == 4) {
        return specularColor;
      }
      if (source == 5) {
        return tempColor;
      }
      return currentColor;
    }
    vec3 d3dCombinerColorArg(int arg, vec4 textureColor, vec4 currentColor, vec4 diffuseColor,
        vec4 specularColor, vec4 tempColor) {
      vec4 source = d3dCombinerSource(arg, textureColor, currentColor, diffuseColor, specularColor, tempColor);
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
    float d3dCombinerAlphaArg(int arg, vec4 textureColor, vec4 currentColor, vec4 diffuseColor,
        vec4 specularColor, vec4 tempColor);
    vec3 d3dApplyColorOp(int op, vec3 arg0, vec3 arg1, float arg1Alpha, vec3 arg2,
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
      if (op == 15) {
        return clamp(arg1 + arg2 * (1.0 - textureColor.a), 0.0, 1.0);
      }
      if (op == 18) {
        return clamp(arg1 + arg1Alpha * arg2, 0.0, 1.0);
      }
      if (op == 19) {
        return clamp(arg1 * arg2 + vec3(arg1Alpha), 0.0, 1.0);
      }
      if (op == 20) {
        return clamp((1.0 - arg1Alpha) * arg2 + arg1, 0.0, 1.0);
      }
      if (op == 21) {
        return clamp((vec3(1.0) - arg1) * arg2 + vec3(arg1Alpha), 0.0, 1.0);
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
      if (op == 15) {
        return clamp(arg1 + arg2 * (1.0 - textureColor.a), 0.0, 1.0);
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
      vec3 arg0 = d3dCombinerColorArg(
        uStage0ColorArg0, textureColor, diffuseColor, diffuseColor, vSpecularColor, tempColor);
      vec3 arg1 = d3dCombinerColorArg(
        uStage0ColorArg1, textureColor, diffuseColor, diffuseColor, vSpecularColor, tempColor);
      float arg1Alpha = d3dCombinerAlphaArg(
        uStage0ColorArg1, textureColor, diffuseColor, diffuseColor, vSpecularColor, tempColor);
      vec3 arg2 = d3dCombinerColorArg(
        uStage0ColorArg2, textureColor, diffuseColor, diffuseColor, vSpecularColor, tempColor);
      return d3dApplyColorOp(
        uStage0ColorOp, arg0, arg1, arg1Alpha, arg2, textureColor, diffuseColor, diffuseColor);
    }
    float d3dCombinerAlphaArg(int arg, vec4 textureColor, vec4 currentColor, vec4 diffuseColor,
        vec4 specularColor, vec4 tempColor) {
      vec4 source = d3dCombinerSource(arg, textureColor, currentColor, diffuseColor, specularColor, tempColor);
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
      float arg0 = d3dCombinerAlphaArg(
        uStage0AlphaArg0, textureColor, diffuseColor, diffuseColor, vSpecularColor, tempColor);
      float arg1 = d3dCombinerAlphaArg(
        uStage0AlphaArg1, textureColor, diffuseColor, diffuseColor, vSpecularColor, tempColor);
      float arg2 = d3dCombinerAlphaArg(
        uStage0AlphaArg2, textureColor, diffuseColor, diffuseColor, vSpecularColor, tempColor);
      if (uStage0AlphaOp == 24) {
        vec3 colorArg1 = d3dCombinerColorArg(
          uStage0AlphaArg1, textureColor, diffuseColor, diffuseColor, vSpecularColor, tempColor);
        vec3 colorArg2 = d3dCombinerColorArg(
          uStage0AlphaArg2, textureColor, diffuseColor, diffuseColor, vSpecularColor, tempColor);
        return d3dDotProduct3(colorArg1, colorArg2).r;
      }
      return d3dApplyAlphaOp(uStage0AlphaOp, arg0, arg1, arg2, textureColor, diffuseColor, diffuseColor);
    }
    vec3 d3dStage1Color(vec4 diffuseColor, vec4 textureColor, vec4 currentColor, vec4 tempColor) {
      if (uStage1ColorOp == 1) {
        return currentColor.rgb;
      }
      vec3 arg0 = d3dCombinerColorArg(
        uStage1ColorArg0, textureColor, currentColor, diffuseColor, vSpecularColor, tempColor);
      vec3 arg1 = d3dCombinerColorArg(
        uStage1ColorArg1, textureColor, currentColor, diffuseColor, vSpecularColor, tempColor);
      float arg1Alpha = d3dCombinerAlphaArg(
        uStage1ColorArg1, textureColor, currentColor, diffuseColor, vSpecularColor, tempColor);
      vec3 arg2 = d3dCombinerColorArg(
        uStage1ColorArg2, textureColor, currentColor, diffuseColor, vSpecularColor, tempColor);
      return d3dApplyColorOp(
        uStage1ColorOp, arg0, arg1, arg1Alpha, arg2, textureColor, currentColor, diffuseColor);
    }
    float d3dStage1Alpha(vec4 diffuseColor, vec4 textureColor, vec4 currentColor, vec4 tempColor) {
      if (uStage1AlphaOp == 1) {
        return currentColor.a;
      }
      float arg0 = d3dCombinerAlphaArg(
        uStage1AlphaArg0, textureColor, currentColor, diffuseColor, vSpecularColor, tempColor);
      float arg1 = d3dCombinerAlphaArg(
        uStage1AlphaArg1, textureColor, currentColor, diffuseColor, vSpecularColor, tempColor);
      float arg2 = d3dCombinerAlphaArg(
        uStage1AlphaArg2, textureColor, currentColor, diffuseColor, vSpecularColor, tempColor);
      if (uStage1AlphaOp == 24) {
        vec3 colorArg1 = d3dCombinerColorArg(
          uStage1AlphaArg1, textureColor, currentColor, diffuseColor, vSpecularColor, tempColor);
        vec3 colorArg2 = d3dCombinerColorArg(
          uStage1AlphaArg2, textureColor, currentColor, diffuseColor, vSpecularColor, tempColor);
        return d3dDotProduct3(colorArg1, colorArg2).r;
      }
      return d3dApplyAlphaOp(uStage1AlphaOp, arg0, arg1, arg2, textureColor, currentColor, diffuseColor);
    }
    // Generic cascade stage used for texture stages 2 and 3. D3D8 stages 2..7
    // feed the previous stage's result in as CURRENT, exactly like stage 1, so a
    // single parameterised combiner reproduces every additional stage. The op/arg
    // selectors arrive as uniforms rather than hard-coded per-stage names.
    vec3 d3dStageColor(int colorOp, int colorArg0, int colorArg1, int colorArg2,
        vec4 diffuseColor, vec4 textureColor, vec4 currentColor, vec4 tempColor) {
      if (colorOp == 1) {
        return currentColor.rgb;
      }
      vec3 arg0 = d3dCombinerColorArg(
        colorArg0, textureColor, currentColor, diffuseColor, vSpecularColor, tempColor);
      vec3 arg1 = d3dCombinerColorArg(
        colorArg1, textureColor, currentColor, diffuseColor, vSpecularColor, tempColor);
      float arg1Alpha = d3dCombinerAlphaArg(
        colorArg1, textureColor, currentColor, diffuseColor, vSpecularColor, tempColor);
      vec3 arg2 = d3dCombinerColorArg(
        colorArg2, textureColor, currentColor, diffuseColor, vSpecularColor, tempColor);
      return d3dApplyColorOp(
        colorOp, arg0, arg1, arg1Alpha, arg2, textureColor, currentColor, diffuseColor);
    }
    float d3dStageAlpha(int alphaOp, int alphaArg0, int alphaArg1, int alphaArg2,
        vec4 diffuseColor, vec4 textureColor, vec4 currentColor, vec4 tempColor) {
      if (alphaOp == 1) {
        return currentColor.a;
      }
      float arg0 = d3dCombinerAlphaArg(
        alphaArg0, textureColor, currentColor, diffuseColor, vSpecularColor, tempColor);
      float arg1 = d3dCombinerAlphaArg(
        alphaArg1, textureColor, currentColor, diffuseColor, vSpecularColor, tempColor);
      float arg2 = d3dCombinerAlphaArg(
        alphaArg2, textureColor, currentColor, diffuseColor, vSpecularColor, tempColor);
      if (alphaOp == 24) {
        vec3 colorArg1 = d3dCombinerColorArg(
          alphaArg1, textureColor, currentColor, diffuseColor, vSpecularColor, tempColor);
        vec3 colorArg2 = d3dCombinerColorArg(
          alphaArg2, textureColor, currentColor, diffuseColor, vSpecularColor, tempColor);
        return d3dDotProduct3(colorArg1, colorArg2).r;
      }
      return d3dApplyAlphaOp(alphaOp, arg0, arg1, arg2, textureColor, currentColor, diffuseColor);
    }
    void main() {
      for (int index = 0; index < 6; ++index) {
        if ((uClipPlaneMask & (1 << index)) != 0 && dot(uClipPlanes[index], vClipPosition) < 0.0) {
          discard;
        }
      }
      vec2 pointTexCoord = gl_PointCoord;
      vec2 texture0Coord = (uDrawingPoints && uPointSpriteEnable) ? pointTexCoord : vTexCoord0;
      vec2 texture1Coord = (uDrawingPoints && uPointSpriteEnable) ? pointTexCoord : vTexCoord1;
      vec4 texture0Color = uUseTexture0
        ? d3dTextureSample(texture(uTexture0,
            d3dTextureCoordinate(texture0Coord, uTexture0FlipY), uTexture0LodBias), uTexture0Semantic)
        : vec4(1.0);
      vec4 texture1Color = uUseTexture1
        ? d3dTextureSample(texture(uTexture1,
            d3dTextureCoordinate(texture1Coord, uTexture1FlipY), uTexture1LodBias), uTexture1Semantic)
        : vec4(1.0);
      vec4 texture2Color = uUseTexture2
        ? d3dTextureSample(texture(uTexture2,
            d3dTextureCoordinate(vTexCoord2, uTexture2FlipY), uTexture2LodBias), uTexture2Semantic)
        : vec4(1.0);
      vec4 texture3Color = uUseTexture3
        ? d3dTextureSample(texture(uTexture3,
            d3dTextureCoordinate(vTexCoord3, uTexture3FlipY), uTexture3LodBias), uTexture3Semantic)
        : vec4(1.0);
      vec4 diffuseColor = uUseFlatShade ? vFlatColor : vColor;
      // Stage 0. CURRENT starts as DIFFUSE; TEMP starts cleared. Each stage's
      // D3DTSS_RESULTARG picks whether its computed value lands in CURRENT
      // (D3DTA_CURRENT) or TEMP (D3DTA_TEMP == 5), leaving the other register
      // untouched so it survives into later stages.
      vec4 stage0ComputedColor = vec4(
        d3dStage0Color(diffuseColor, texture0Color, vec4(0.0)),
        d3dStage0Alpha(diffuseColor, texture0Color, vec4(0.0))
      );
      vec4 currentColor = uStage0ResultArg == 5 ? diffuseColor : stage0ComputedColor;
      vec4 tempColor = uStage0ResultArg == 5 ? stage0ComputedColor : vec4(0.0);
      // Stage 1 (unchanged combiner functions; result now routed through
      // D3DTSS_RESULTARG so it can feed stage 2 as CURRENT or TEMP).
      vec4 stage1ComputedColor = vec4(
        d3dStage1Color(diffuseColor, texture1Color, currentColor, tempColor),
        d3dStage1Alpha(diffuseColor, texture1Color, currentColor, tempColor)
      );
      if (uStage1ResultArg == 5) {
        tempColor = stage1ComputedColor;
      } else {
        currentColor = stage1ComputedColor;
      }
      // Stage 2/3 — D3D8 texture-stage CASCADE TERMINATION. Per the D3D8 SDK
      // (Textures/Blending/TextureBlendingOperations): "You can disable a
      // texture stage AND ANY SUBSEQUENT texture blending stages in the cascade
      // by setting the color operation for that stage to D3DTOP_DISABLE." So the
      // FIRST stage whose colorOp is DISABLE ends the cascade — every higher
      // stage is ignored regardless of its own (possibly STALE) state. The
      // engine only resets the stages a given shader uses (terrain is 2-stage,
      // stops at stage 1), leaving stage 2/3 combiner state from an earlier
      // 4-stage draw (e.g. river/trapezoid water) resident. Gating stages 2/3
      // only on their own colorOp let that stale stage-3 combiner (a MODULATE by
      // a bound water/noise texture) leak onto the next terrain draw and multiply
      // it toward black — the faceted black holes. Track a cascade-active flag
      // that goes false at the first DISABLE stage and require it for 2 and 3,
      // matching hardware and keeping 0/1-only draws byte-for-byte identical.
      bool cascadeActive = uStage1ColorOp != 1;
      if (cascadeActive && uStage2ColorOp != 1) {
        vec4 stage2ComputedColor = vec4(
          d3dStageColor(uStage2ColorOp, uStage2ColorArg0, uStage2ColorArg1, uStage2ColorArg2,
            diffuseColor, texture2Color, currentColor, tempColor),
          d3dStageAlpha(uStage2AlphaOp, uStage2AlphaArg0, uStage2AlphaArg1, uStage2AlphaArg2,
            diffuseColor, texture2Color, currentColor, tempColor)
        );
        if (uStage2ResultArg == 5) {
          tempColor = stage2ComputedColor;
        } else {
          currentColor = stage2ComputedColor;
        }
      } else {
        cascadeActive = false;
      }
      // Stage 3 runs only if stages 1 AND 2 both stayed enabled (cascade intact).
      if (cascadeActive && uStage3ColorOp != 1) {
        vec4 stage3ComputedColor = vec4(
          d3dStageColor(uStage3ColorOp, uStage3ColorArg0, uStage3ColorArg1, uStage3ColorArg2,
            diffuseColor, texture3Color, currentColor, tempColor),
          d3dStageAlpha(uStage3AlphaOp, uStage3AlphaArg0, uStage3AlphaArg1, uStage3AlphaArg2,
            diffuseColor, texture3Color, currentColor, tempColor)
        );
        if (uStage3ResultArg == 5) {
          tempColor = stage3ComputedColor;
        } else {
          currentColor = stage3ComputedColor;
        }
      }
      vec4 color = currentColor;
      if (!uAlphaTestEnabled && uImplicitAlphaCutoutThreshold >= 0.0 &&
          color.a <= uImplicitAlphaCutoutThreshold) {
        discard;
      }
      if (uAlphaTestEnabled && !d3dAlphaCompare(color.a, uAlphaRef)) {
        discard;
      }
      if (uFogEnabled) {
        float fogDistance = uFogRangeEnabled ? vFogRangeDistance : vFogDepth;
        float fogAmount = clamp((fogDistance - uFogStart) / max(uFogEnd - uFogStart, 0.000001), 0.0, 1.0);
        color.rgb = mix(color.rgb, uFogColor, fogAmount);
      }
      fragColor = color;
    }
  `;
  d3d8FFFragmentSourceCache = fragmentSource;
  const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
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

  d3d8DrawProgram = buildD3D8DrawProgramLocations(program);
  // Compile the small common-particle variant during renderer warm-up so the
  // first explosion does not pay a shader compile/link hitch mid-frame.
  ensureD3D8ParticleProgram();
  return d3d8DrawProgram;
}

// Terrain's XYZD+TEX2 stream is deliberately unlit. The generic fixed-function
// vertex shader must support every D3D8 FVF and therefore carries normal-matrix,
// camera, point-sprite, material, and eight-light machinery. Keeping that
// machinery live behind uniforms is especially expensive on tile GPUs even
// though this stream has no normal and never enables lighting. This variant is
// interface-compatible with both the fixed-function fragment cascade and the
// translated ps.1.x terrain shaders, but computes only the position, diffuse
// color, fog, clip-plane position, and texture coordinates those draws consume.
function d3d8UnlitTex2VertexSource() {
  if (d3d8UnlitTex2VertexSourceCache) {
    return d3d8UnlitTex2VertexSourceCache;
  }
  d3d8UnlitTex2VertexSourceCache = `#version 300 es
    in vec4 aPosition;
    in vec4 aDiffuseBgra;
    in vec2 aTexCoord0;
    in vec2 aTexCoord1;
    uniform mat4 uWorld;
    uniform mat4 uView;
    uniform mat4 uProjection;
    uniform float uDepthBias;
    uniform bool uFogEnabled;
    uniform bool uFogRangeEnabled;
    uniform int uTexture0CoordinateMode;
    uniform bool uUseTexture0Transform;
    uniform mat4 uTexture0Transform;
    uniform int uTexture0TransformComponentCount;
    uniform bool uTexture0TransformProjected;
    uniform int uTexture1CoordinateMode;
    uniform bool uUseTexture1Transform;
    uniform mat4 uTexture1Transform;
    uniform int uTexture1TransformComponentCount;
    uniform bool uTexture1TransformProjected;
    uniform int uTexture2CoordinateMode;
    uniform int uTexture2CoordSet;
    uniform bool uUseTexture2Transform;
    uniform mat4 uTexture2Transform;
    uniform int uTexture2TransformComponentCount;
    uniform bool uTexture2TransformProjected;
    uniform int uTexture3CoordinateMode;
    uniform int uTexture3CoordSet;
    uniform bool uUseTexture3Transform;
    uniform mat4 uTexture3Transform;
    uniform int uTexture3TransformComponentCount;
    uniform bool uTexture3TransformProjected;
    out vec4 vColor;
    out vec4 vSpecularColor;
    flat out vec4 vFlatColor;
    out vec2 vTexCoord0;
    out vec2 vTexCoord1;
    out vec2 vTexCoord2;
    out vec2 vTexCoord3;
    out vec4 vClipPosition;
    out float vFogDepth;
    out float vFogRangeDistance;
    vec4 d3dTextureCoordinateSource(
      vec2 texCoord,
      int coordinateMode,
      vec3 cameraSpacePosition) {
      if (coordinateMode == ${D3DTSS_TCI_CAMERASPACEPOSITION}) {
        return vec4(cameraSpacePosition, 1.0);
      }
      return vec4(texCoord, 0.0, 1.0);
    }
    vec2 d3dApplyTextureTransform(
      vec4 texCoord,
      mat4 transformMatrix,
      int componentCount,
      bool projected) {
      vec4 transformed = transformMatrix * texCoord;
      if (projected) {
        float divisor = componentCount == 4 ? transformed.w : transformed.z;
        if (abs(divisor) > 0.000001) {
          return transformed.xy / divisor;
        }
      }
      return transformed.xy;
    }
    vec2 d3dStageCoordinate(
      vec2 texCoord,
      int coordinateMode,
      vec3 cameraSpacePosition,
      bool useTransform,
      mat4 transformMatrix,
      int componentCount,
      bool projected) {
      vec4 source = d3dTextureCoordinateSource(
        texCoord,
        coordinateMode,
        cameraSpacePosition);
      return useTransform
        ? d3dApplyTextureTransform(source, transformMatrix, componentCount, projected)
        : source.xy;
    }
    void main() {
      vec4 worldPosition = uWorld * vec4(aPosition.xyz, 1.0);
      vec4 viewPosition = uView * worldPosition;
      vec4 d3dClip = uProjection * viewPosition;
      gl_Position = vec4(
        d3dClip.x,
        d3dClip.y,
        d3dClip.z * 2.0 - d3dClip.w,
        d3dClip.w);
      gl_Position.z -= uDepthBias * gl_Position.w;
      gl_PointSize = 1.0;
      vClipPosition = worldPosition;
      vFogDepth = max(viewPosition.z, 0.0);
      vFogRangeDistance = uFogEnabled && uFogRangeEnabled
        ? length(viewPosition.xyz)
        : vFogDepth;
      vColor = vec4(
        aDiffuseBgra.b,
        aDiffuseBgra.g,
        aDiffuseBgra.r,
        aDiffuseBgra.a);
      vSpecularColor = vec4(0.0, 0.0, 0.0, 1.0);
      vFlatColor = vColor;
      vTexCoord0 = d3dStageCoordinate(
        aTexCoord0,
        uTexture0CoordinateMode,
        viewPosition.xyz,
        uUseTexture0Transform,
        uTexture0Transform,
        uTexture0TransformComponentCount,
        uTexture0TransformProjected);
      vTexCoord1 = d3dStageCoordinate(
        aTexCoord1,
        uTexture1CoordinateMode,
        viewPosition.xyz,
        uUseTexture1Transform,
        uTexture1Transform,
        uTexture1TransformComponentCount,
        uTexture1TransformProjected);
      vec2 texCoord2 = uTexture2CoordSet == 1 ? aTexCoord1 : aTexCoord0;
      vTexCoord2 = d3dStageCoordinate(
        texCoord2,
        uTexture2CoordinateMode,
        viewPosition.xyz,
        uUseTexture2Transform,
        uTexture2Transform,
        uTexture2TransformComponentCount,
        uTexture2TransformProjected);
      vec2 texCoord3 = uTexture3CoordSet == 1 ? aTexCoord1 : aTexCoord0;
      vTexCoord3 = d3dStageCoordinate(
        texCoord3,
        uTexture3CoordinateMode,
        viewPosition.xyz,
        uUseTexture3Transform,
        uTexture3Transform,
        uTexture3TransformComponentCount,
        uTexture3TransformProjected);
    }
  `;
  return d3d8UnlitTex2VertexSourceCache;
}

function ensureD3D8UnlitTex2Program() {
  if (!gl) {
    return null;
  }
  if (d3d8UnlitTex2Program) {
    return d3d8UnlitTex2Program;
  }
  ensureD3D8DrawProgram();
  const vertexShader = compileShader(gl.VERTEX_SHADER, d3d8UnlitTex2VertexSource());
  const fragmentShader = compileShader(gl.FRAGMENT_SHADER, d3d8FFFragmentSourceCache);
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`D3D8 unlit TEX2 program link failed: ${info}`);
  }
  d3d8UnlitTex2Program = buildD3D8DrawProgramLocations(program);
  d3d8UnlitTex2Program.unlitTex2 = true;
  return d3d8UnlitTex2Program;
}

// The dominant object path in Generals is an XYZ+normal+TEX1 stream with
// fixed-function lighting and a simple texture/diffuse fragment operation
// (foliage, structures, and props). The generic vertex shader supports every
// D3D8 mode in one program, so it retains per-vertex matrix inversion, view
// reconstruction, point sprites, fog, four texgen stages, and specular work
// even when all of those modes are disabled. This exact variant keeps the
// complete D3D8 material and point/spot/directional light equations, but only
// emits the position, lit diffuse color, and passthrough UV consumed by the
// eligible draw.
function d3d8LitTex1VertexSource() {
  if (d3d8LitTex1VertexSourceCache) {
    return d3d8LitTex1VertexSourceCache;
  }
  d3d8LitTex1VertexSourceCache = `#version 300 es
    in vec4 aPosition;
    in vec3 aNormal;
    in vec4 aDiffuseBgra;
    in vec4 aSpecularBgra;
    in vec2 aTexCoord0;
    uniform mat4 uWorld;
    uniform mat4 uView;
    uniform mat4 uProjection;
    uniform mat3 uWorldNormalMatrix;
    uniform float uDepthBias;
    uniform bool uNormalizeNormals;
    uniform bool uColorVertexEnabled;
    uniform vec4 uSceneAmbient;
    uniform vec4 uMaterialDiffuse;
    uniform vec4 uMaterialAmbient;
    uniform vec4 uMaterialEmissive;
    uniform int uDiffuseMaterialSource;
    uniform int uAmbientMaterialSource;
    uniform int uEmissiveMaterialSource;
    uniform int uFixedLightCount;
    uniform int uFixedLightType[${D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT}];
    uniform vec4 uFixedLightDiffuse[${D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT}];
    uniform vec4 uFixedLightAmbient[${D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT}];
    uniform vec3 uFixedLightPosition[${D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT}];
    uniform vec3 uFixedLightDirection[${D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT}];
    uniform vec4 uFixedLightRangeAttenuation[${D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT}];
    uniform vec3 uFixedLightSpot[${D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT}];
    out vec4 vColor;
    flat out vec4 vFlatColor;
    out vec2 vTexCoord0;
    vec4 d3dMaterialSourceColor(int source, vec4 materialColor, vec4 color1, vec4 color2) {
      if (!uColorVertexEnabled) return materialColor;
      if (source == 1) return color1;
      if (source == 2) return color2;
      return materialColor;
    }
    float d3dLightAttenuation(int index, float distanceToLight) {
      vec4 rangeAttenuation = uFixedLightRangeAttenuation[index];
      if (rangeAttenuation.x > 0.0 && distanceToLight > rangeAttenuation.x) return 0.0;
      float denominator = rangeAttenuation.y +
        rangeAttenuation.z * distanceToLight +
        rangeAttenuation.w * distanceToLight * distanceToLight;
      return denominator <= 0.000001 ? 1.0 : 1.0 / denominator;
    }
    float d3dSpotEffect(int index, vec3 lightDirection) {
      if (uFixedLightType[index] != ${D3DLIGHT_SPOT}) return 1.0;
      vec3 directionSource = uFixedLightDirection[index];
      vec3 spotDirection = length(directionSource) > 0.000001
        ? normalize(directionSource) : vec3(0.0, 0.0, -1.0);
      float rho = dot(spotDirection, -lightDirection);
      vec3 spot = uFixedLightSpot[index];
      float cosTheta = cos(max(spot.x, 0.0) * 0.5);
      float cosPhi = cos(max(spot.y, spot.x) * 0.5);
      if (rho <= cosPhi) return 0.0;
      if (rho >= cosTheta || abs(cosTheta - cosPhi) < 0.000001) return 1.0;
      float amount = clamp((rho - cosPhi) / (cosTheta - cosPhi), 0.0, 1.0);
      return spot.z <= 0.0 ? 1.0 : pow(amount, spot.z);
    }
    vec4 d3dApplyLighting(vec4 color1, vec4 color2, vec3 worldPosition, vec3 normal) {
      vec4 diffuseMaterial = d3dMaterialSourceColor(
        uDiffuseMaterialSource, uMaterialDiffuse, color1, color2);
      vec4 ambientMaterial = d3dMaterialSourceColor(
        uAmbientMaterialSource, uMaterialAmbient, color1, color2);
      vec4 emissiveMaterial = d3dMaterialSourceColor(
        uEmissiveMaterialSource, uMaterialEmissive, color1, color2);
      vec3 litRgb = emissiveMaterial.rgb + ambientMaterial.rgb * uSceneAmbient.rgb;
      vec3 effectiveNormal = uNormalizeNormals
        ? (length(normal) > 0.000001 ? normalize(normal) : vec3(0.0, 0.0, 1.0))
        : normal;
      if (length(effectiveNormal) <= 0.000001) effectiveNormal = vec3(0.0, 0.0, 1.0);
      for (int index = 0; index < ${D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT}; ++index) {
        if (index >= uFixedLightCount) break;
        vec3 lightVector = uFixedLightType[index] == ${D3DLIGHT_DIRECTIONAL}
          ? -uFixedLightDirection[index]
          : uFixedLightPosition[index] - worldPosition;
        float distanceToLight = length(lightVector);
        vec3 lightDirection = distanceToLight > 0.000001
          ? normalize(lightVector) : effectiveNormal;
        float attenuation = uFixedLightType[index] == ${D3DLIGHT_DIRECTIONAL}
          ? 1.0
          : d3dLightAttenuation(index, distanceToLight) * d3dSpotEffect(index, lightDirection);
        float diffuseAmount = max(dot(effectiveNormal, lightDirection), 0.0);
        litRgb += ambientMaterial.rgb * uFixedLightAmbient[index].rgb * attenuation;
        litRgb += diffuseMaterial.rgb * uFixedLightDiffuse[index].rgb * diffuseAmount * attenuation;
      }
      return vec4(clamp(litRgb, 0.0, 1.0), diffuseMaterial.a);
    }
    void main() {
      vec4 worldPosition = uWorld * vec4(aPosition.xyz, 1.0);
      vec4 viewPosition = uView * worldPosition;
      vec4 d3dClip = uProjection * viewPosition;
      gl_Position = vec4(d3dClip.x, d3dClip.y,
        d3dClip.z * 2.0 - d3dClip.w, d3dClip.w);
      gl_Position.z -= uDepthBias * gl_Position.w;
      vec4 color1 = vec4(aDiffuseBgra.b, aDiffuseBgra.g,
        aDiffuseBgra.r, aDiffuseBgra.a);
      vec4 color2 = vec4(aSpecularBgra.b, aSpecularBgra.g,
        aSpecularBgra.r, aSpecularBgra.a);
      vColor = d3dApplyLighting(
        color1, color2, worldPosition.xyz, uWorldNormalMatrix * aNormal);
      vFlatColor = vColor;
      vTexCoord0 = aTexCoord0;
    }
  `;
  return d3d8LitTex1VertexSourceCache;
}

function d3d8SimpleFFFragmentSource(fragmentKind, fastStaticState = null) {
  const [colorMode, alphaMode] = String(fragmentKind).split("|");
  const validModes = new Set(["diffuse", "texture", "modulate", "one"]);
  if (!validModes.has(colorMode) || !validModes.has(alphaMode)) {
    throw new Error(`unsupported simple fixed-function fragment kind: ${fragmentKind}`);
  }
  const needsTexture = colorMode === "texture" || colorMode === "modulate" ||
    alphaMode === "texture" || alphaMode === "modulate";
  const colorExpression = colorMode === "texture"
    ? "textureColor.rgb"
    : colorMode === "modulate"
      ? "textureColor.rgb * diffuseColor.rgb"
      : colorMode === "one"
        ? "vec3(1.0)"
      : "diffuseColor.rgb";
  const alphaExpression = alphaMode === "texture"
    ? "textureColor.a"
    : alphaMode === "modulate"
      ? "textureColor.a * diffuseColor.a"
      : alphaMode === "one"
        ? "1.0"
      : "diffuseColor.a";
  if (fastStaticState) {
    const flipY = fastStaticState.includes("flip-y");
    const cutout = fastStaticState.includes("cutout");
    return `#version 300 es
      // D3D8 fixed-function and ps.1.x color math has substantially less
      // precision than GLES mediump. Keeping this at mediump preserves the
      // source API's output while allowing mobile GPUs to use packed ALUs.
      precision mediump float;
      in vec4 vColor;
      flat in vec4 vFlatColor;
      ${needsTexture ? "in vec2 vTexCoord0;" : ""}
      uniform bool uUseFlatShade;
      ${needsTexture ? "uniform sampler2D uTexture0;" : ""}
      out vec4 fragColor;
      void main() {
        vec4 diffuseColor = uUseFlatShade ? vFlatColor : vColor;
        ${needsTexture
          ? `vec2 textureCoordinate = ${flipY
            ? "vec2(vTexCoord0.x, 1.0 - vTexCoord0.y)"
            : "vTexCoord0"};
        vec4 textureColor = texture(uTexture0, textureCoordinate);`
          : "vec4 textureColor = vec4(1.0);"}
        vec4 color = vec4(${colorExpression}, ${alphaExpression});
        ${cutout ? "if (color.a <= 0.00392156862745098) { discard; }" : ""}
        fragColor = color;
      }
    `;
  }
  return `#version 300 es
    precision highp float;
    in vec4 vColor;
    flat in vec4 vFlatColor;
    ${needsTexture ? "in vec2 vTexCoord0;" : ""}
    in vec4 vClipPosition;
    in float vFogDepth;
    in float vFogRangeDistance;
    uniform int uClipPlaneMask;
    uniform vec4 uClipPlanes[6];
    uniform bool uUseFlatShade;
    ${needsTexture ? `
    uniform sampler2D uTexture0;
    uniform float uTexture0LodBias;
    uniform int uTexture0Semantic;
    uniform bool uTexture0FlipY;
    uniform bool uDrawingPoints;
    uniform bool uPointSpriteEnable;
    ` : ""}
    uniform bool uAlphaTestEnabled;
    uniform int uAlphaFunc;
    uniform float uAlphaRef;
    uniform float uImplicitAlphaCutoutThreshold;
    uniform bool uFogEnabled;
    uniform bool uFogRangeEnabled;
    uniform vec3 uFogColor;
    uniform float uFogStart;
    uniform float uFogEnd;
    out vec4 fragColor;
    bool d3dAlphaCompare(float value, float reference) {
      if (uAlphaFunc == 1) return false;
      if (uAlphaFunc == 2) return value < reference;
      if (uAlphaFunc == 3) return value == reference;
      if (uAlphaFunc == 4) return value <= reference;
      if (uAlphaFunc == 5) return value > reference;
      if (uAlphaFunc == 6) return value != reference;
      if (uAlphaFunc == 7) return value >= reference;
      return true;
    }
    ${needsTexture ? `
    vec4 d3dTextureSample(vec4 rawSample, int semantic) {
      if (semantic == 1) return vec4(0.0, 0.0, 0.0, rawSample.r);
      if (semantic == 2) return vec4(rawSample.r, rawSample.r, rawSample.r, 1.0);
      if (semantic == 3) return vec4(rawSample.r, rawSample.r, rawSample.r, rawSample.g);
      if (semantic == 4) {
        vec2 signedBump = clamp(
          (rawSample.rg * 255.0 - 128.0) / 127.0,
          -1.0,
          1.0);
        return vec4(signedBump, 0.0, 1.0);
      }
      return rawSample;
    }
    ` : ""}
    void main() {
      for (int index = 0; index < 6; ++index) {
        if ((uClipPlaneMask & (1 << index)) != 0 &&
            dot(uClipPlanes[index], vClipPosition) < 0.0) {
          discard;
        }
      }
      vec4 diffuseColor = uUseFlatShade ? vFlatColor : vColor;
      ${needsTexture ? `
      vec2 textureCoordinate = uDrawingPoints && uPointSpriteEnable
        ? gl_PointCoord
        : vTexCoord0;
      if (uTexture0FlipY) {
        textureCoordinate.y = 1.0 - textureCoordinate.y;
      }
      vec4 textureColor = d3dTextureSample(
        texture(uTexture0, textureCoordinate, uTexture0LodBias),
        uTexture0Semantic);
      ` : "vec4 textureColor = vec4(1.0);"}
      vec4 color = vec4(${colorExpression}, ${alphaExpression});
      if (!uAlphaTestEnabled && uImplicitAlphaCutoutThreshold >= 0.0 &&
          color.a <= uImplicitAlphaCutoutThreshold) {
        discard;
      }
      if (uAlphaTestEnabled && !d3dAlphaCompare(color.a, uAlphaRef)) {
        discard;
      }
      if (uFogEnabled) {
        float fogDistance = uFogRangeEnabled ? vFogRangeDistance : vFogDepth;
        float fogAmount = clamp(
          (fogDistance - uFogStart) / max(uFogEnd - uFogStart, 0.000001),
          0.0,
          1.0);
        color.rgb = mix(color.rgb, uFogColor, fogAmount);
      }
      fragColor = color;
    }
  `;
}

function ensureD3D8SimpleFFProgram(
  fragmentKind,
  vertexVariant = "generic",
  fragmentVariant = "dynamic",
) {
  if (!gl) {
    return null;
  }
  const normalizedVertexVariant = vertexVariant === "unlit-tex2"
    ? "unlit-tex2"
    : vertexVariant === "lit-tex1"
      ? "lit-tex1"
      : "generic";
  const fastFragmentVariants = new Set([
    "fast",
    "fast-flip-y",
    "fast-cutout",
    "fast-cutout-flip-y",
  ]);
  const normalizedFragmentVariant = fastFragmentVariants.has(fragmentVariant)
    ? fragmentVariant
    : "dynamic";
  const key = `${normalizedVertexVariant}|${normalizedFragmentVariant}|${fragmentKind}`;
  const cached = d3d8SimpleFFPrograms.get(key);
  if (cached) {
    return cached;
  }
  let vertexSource;
  if (normalizedVertexVariant === "unlit-tex2") {
    vertexSource = d3d8UnlitTex2VertexSource();
  } else if (normalizedVertexVariant === "lit-tex1") {
    vertexSource = d3d8LitTex1VertexSource();
  } else {
    ensureD3D8DrawProgram();
    vertexSource = d3d8FFVertexSourceCache;
  }
  const vertexShader = compileShader(gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(
    gl.FRAGMENT_SHADER,
    d3d8SimpleFFFragmentSource(
      fragmentKind,
      normalizedFragmentVariant === "dynamic" ? null : normalizedFragmentVariant,
    ),
  );
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`D3D8 simple fixed-function program link failed (${key}): ${info}`);
  }
  const bridgeProgram = buildD3D8DrawProgramLocations(program);
  bridgeProgram.simpleFF = true;
  bridgeProgram.simpleFFFragmentKind = fragmentKind;
  bridgeProgram.fastSimpleFF = normalizedFragmentVariant !== "dynamic";
  bridgeProgram.fastSimpleFFVariant = normalizedFragmentVariant;
  bridgeProgram.unlitTex2 = normalizedVertexVariant === "unlit-tex2";
  d3d8SimpleFFPrograms.set(key, bridgeProgram);
  return bridgeProgram;
}

function ensureD3D8ParticleProgram() {
  if (!gl) {
    return null;
  }
  if (d3d8ParticleProgram) {
    return d3d8ParticleProgram;
  }

  const vertexShader = compileShader(gl.VERTEX_SHADER, `#version 300 es
    in vec4 aPosition;
    in vec4 aDiffuseBgra;
    in vec2 aTexCoord0;
    uniform mat4 uWorld;
    uniform mat4 uView;
    uniform mat4 uProjection;
    uniform float uDepthBias;
    out vec4 vColor;
    out vec2 vTexCoord0;
    void main() {
      vec4 viewPosition = uView * (uWorld * vec4(aPosition.xyz, 1.0));
      vec4 d3dClip = uProjection * viewPosition;
      gl_Position = vec4(d3dClip.x, d3dClip.y,
        d3dClip.z * 2.0 - d3dClip.w, d3dClip.w);
      gl_Position.z -= uDepthBias * gl_Position.w;
      vColor = vec4(aDiffuseBgra.b, aDiffuseBgra.g,
        aDiffuseBgra.r, aDiffuseBgra.a);
      vTexCoord0 = aTexCoord0;
    }
  `);
  const fragmentShader = compileShader(gl.FRAGMENT_SHADER, `#version 300 es
    precision highp float;
    in vec4 vColor;
    in vec2 vTexCoord0;
    uniform sampler2D uTexture0;
    uniform float uTexture0LodBias;
    uniform bool uTexture0FlipY;
    out vec4 fragColor;
    void main() {
      vec2 uv = uTexture0FlipY
        ? vec2(vTexCoord0.x, 1.0 - vTexCoord0.y)
        : vTexCoord0;
      fragColor = texture(uTexture0, uv, uTexture0LodBias) * vColor;
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
    throw new Error(`D3D8 particle program link failed: ${info}`);
  }
  d3d8ParticleProgram = buildD3D8DrawProgramLocations(program);
  return d3d8ParticleProgram;
}

function d3d8CanUseParticleProgram({
  renderState,
  primitiveType,
  vertexShaderFvf,
  vertexStride,
  canSampleTexture0,
  canSampleTexture1,
  canSampleTexture2,
  canSampleTexture3,
  texture0Coordinates,
  texture0SemanticMode,
  implicitAlphaCutoutThreshold,
}) {
  const stage0 = renderState?.textureStages?.[0];
  const stage1 = renderState?.textureStages?.[1];
  return (Number(primitiveType) >>> 0) === D3DPT_TRIANGLELIST &&
    (Number(vertexShaderFvf) >>> 0) ===
      (D3DFVF_XYZ | D3DFVF_NORMAL | D3DFVF_DIFFUSE | D3DFVF_TEX2) &&
    (Number(vertexStride) >>> 0) === 44 &&
    renderState?.lighting === 0 &&
    renderState?.fogEnable === 0 &&
    renderState?.alphaTestEnable === 0 &&
    renderState?.cullMode === D3DCULL_NONE &&
    d3d8ClipPlaneMask(renderState) === 0 &&
    canSampleTexture0 && !canSampleTexture1 && !canSampleTexture2 && !canSampleTexture3 &&
    texture0SemanticMode === 0 &&
    texture0Coordinates?.mode === D3DTSS_TCI_PASSTHRU &&
    texture0Coordinates?.coordSet === 0 &&
    texture0Coordinates?.transformApplied !== true &&
    implicitAlphaCutoutThreshold < 0 &&
    stage0?.colorOp === D3DTOP_MODULATE &&
    stage0?.colorArg1 === D3DTA_TEXTURE &&
    stage0?.colorArg2 === D3DTA_DIFFUSE &&
    stage0?.alphaOp === D3DTOP_MODULATE &&
    stage0?.alphaArg1 === D3DTA_TEXTURE &&
    stage0?.alphaArg2 === D3DTA_DIFFUSE &&
    stage0?.resultArg === D3DTA_CURRENT &&
    stage1?.colorOp === D3DTOP_DISABLE &&
    stage1?.alphaOp === D3DTOP_DISABLE;
}

function d3d8CanUseUnlitTex2Program({
  renderState,
  primitiveType,
  vertexShaderFvf,
  vertexStride,
  canSampleTexture0,
  canSampleTexture1,
  canSampleTexture2,
  canSampleTexture3,
  texture0Coordinates,
  texture1Coordinates,
  texture2Coordinates,
  texture3Coordinates,
  usePositionTransforms,
  vertexPretransformed,
}) {
  if ((Number(primitiveType) >>> 0) !== D3DPT_TRIANGLELIST ||
      (Number(vertexShaderFvf) >>> 0) !== (D3DFVF_XYZ | D3DFVF_DIFFUSE | D3DFVF_TEX2) ||
      (Number(vertexStride) >>> 0) !== 32 ||
      renderState?.lighting !== 0 ||
      usePositionTransforms !== true ||
      vertexPretransformed === true) {
    return false;
  }
  const sampledCoordinates = [
    [canSampleTexture0, texture0Coordinates],
    [canSampleTexture1, texture1Coordinates],
    [canSampleTexture2, texture2Coordinates],
    [canSampleTexture3, texture3Coordinates],
  ];
  return sampledCoordinates.every(([canSample, coordinates]) =>
    !canSample ||
    (coordinates?.supported === true &&
      (coordinates.mode === D3DTSS_TCI_PASSTHRU ||
        coordinates.mode === D3DTSS_TCI_CAMERASPACEPOSITION)));
}

function d3d8CanUseLitTex1Program({
  renderState,
  primitiveType,
  vertexShaderFvf,
  vertexStride,
  canSampleTexture0,
  canSampleTexture1,
  canSampleTexture2,
  canSampleTexture3,
  texture0Coordinates,
  usePositionTransforms,
  vertexPretransformed,
  fastSimpleFFVariant,
  world,
}) {
  return Boolean(
    fastSimpleFFVariant &&
    (Number(primitiveType) >>> 0) === D3DPT_TRIANGLELIST &&
    (Number(vertexShaderFvf) >>> 0) === (D3DFVF_XYZ | D3DFVF_NORMAL | D3DFVF_TEX1) &&
    (Number(vertexStride) >>> 0) === 32 &&
    renderState?.lighting !== 0 &&
    renderState?.specularEnable === 0 &&
    usePositionTransforms === true &&
    vertexPretransformed !== true &&
    canSampleTexture0 && !canSampleTexture1 && !canSampleTexture2 && !canSampleTexture3 &&
    texture0Coordinates?.supported === true &&
    texture0Coordinates.mode === D3DTSS_TCI_PASSTHRU &&
    texture0Coordinates.coordSet === 0 &&
    texture0Coordinates.transformApplied !== true &&
    d3d8WorldNormalMatrix(world) !== null
  );
}

function d3d8CanUseStaticSM1Fragment({
  renderState,
  unlitTex2VertexDraw,
  canSampleTexture0,
  canSampleTexture1,
  canSampleTexture2,
  canSampleTexture3,
  texture0SemanticMode,
  texture1SemanticMode,
  texture2SemanticMode,
  texture3SemanticMode,
  texture0FlipY,
  texture1FlipY,
  texture2FlipY,
  texture3FlipY,
}) {
  if (!unlitTex2VertexDraw ||
      renderState?.alphaTestEnable !== 0 ||
      renderState?.fogEnable !== 0 ||
      d3d8ClipPlaneMask(renderState) !== 0 ||
      !canSampleTexture0 || !canSampleTexture1 ||
      !canSampleTexture2 || !canSampleTexture3 ||
      texture0SemanticMode !== 0 || texture1SemanticMode !== 0 ||
      texture2SemanticMode !== 0 || texture3SemanticMode !== 0 ||
      texture0FlipY || texture1FlipY || texture2FlipY || texture3FlipY) {
    return false;
  }
  // This variant bakes only the fixed state shared by the enhanced terrain
  // draws. Texture coordinates (including D3D texture transforms) and the
  // original ps.1.x instruction body remain unchanged.
  return renderState.textureStages.slice(0, 4)
    .every((stage) => d3dDwordToFloat(stage.mipMapLodBias) === 0);
}

function d3d8SimpleFFSourceMode(argument, canSampleTexture0) {
  const value = Number(argument ?? 0) >>> 0;
  if ((value & D3DTA_SUPPORTED_MODIFIERS) !== 0) {
    return null;
  }
  const source = value & D3DTA_SELECTMASK;
  if (source === D3DTA_TEXTURE) {
    // The generic bridge deliberately supplies vec4(1) for an unbound D3D
    // texture. Preserve that behavior in the static path instead of either
    // sampling an unbound WebGL texture or falling back to the giant dynamic
    // combiner. The game's blended shroud overlay uses exactly this state.
    return canSampleTexture0 ? "texture" : "one";
  }
  if (source === D3DTA_DIFFUSE || source === D3DTA_CURRENT) {
    return "diffuse";
  }
  return null;
}

function d3d8SimpleFFOperationMode(
  operation,
  argument1,
  argument2,
  canSampleTexture0,
) {
  const op = Number(operation ?? D3DTOP_DISABLE) >>> 0;
  if (op === D3DTOP_DISABLE) {
    return "diffuse";
  }
  if (op === D3DTOP_SELECTARG1) {
    return d3d8SimpleFFSourceMode(argument1, canSampleTexture0);
  }
  if (op === D3DTOP_SELECTARG2) {
    return d3d8SimpleFFSourceMode(argument2, canSampleTexture0);
  }
  if (op === D3DTOP_MODULATE) {
    const mode1 = d3d8SimpleFFSourceMode(argument1, canSampleTexture0);
    const mode2 = d3d8SimpleFFSourceMode(argument2, canSampleTexture0);
    if ((mode1 === "texture" && mode2 === "diffuse") ||
        (mode1 === "diffuse" && mode2 === "texture")) {
      return "modulate";
    }
    if (mode1 === "one") {
      return mode2;
    }
    if (mode2 === "one") {
      return mode1;
    }
  }
  return null;
}

function d3d8SimpleFFFragmentKind({
  renderState,
  canSampleTexture0,
  canSampleTexture1,
  canSampleTexture2,
  canSampleTexture3,
}) {
  const stage0 = renderState?.textureStages?.[0];
  const stage1 = renderState?.textureStages?.[1];
  if (!stage0 || !stage1 ||
      stage0.resultArg !== D3DTA_CURRENT ||
      stage1.colorOp !== D3DTOP_DISABLE ||
      canSampleTexture1 || canSampleTexture2 || canSampleTexture3) {
    return null;
  }
  const colorMode = d3d8SimpleFFOperationMode(
    stage0.colorOp,
    stage0.colorArg1,
    stage0.colorArg2,
    canSampleTexture0,
  );
  const alphaMode = d3d8SimpleFFOperationMode(
    stage0.alphaOp,
    stage0.alphaArg1,
    stage0.alphaArg2,
    canSampleTexture0,
  );
  if (!colorMode || !alphaMode) {
    return null;
  }
  const needsTexture = colorMode === "texture" || colorMode === "modulate" ||
    alphaMode === "texture" || alphaMode === "modulate";
  if (needsTexture && !canSampleTexture0) {
    return null;
  }
  return `${colorMode}|${alphaMode}`;
}

function d3d8SimpleFFKindUsesTexture(fragmentKind) {
  return String(fragmentKind).split("|")
    .some((mode) => mode === "texture" || mode === "modulate");
}

function d3d8FastSimpleFFVariant({
  fragmentKind,
  renderState,
  primitiveType,
  implicitAlphaCutoutThreshold,
  texture0SemanticMode,
  texture0FlipY,
}) {
  if (!fragmentKind ||
      renderState?.alphaTestEnable !== 0 ||
      renderState?.fogEnable !== 0 ||
      d3d8ClipPlaneMask(renderState) !== 0 ||
      ((Number(primitiveType) >>> 0) === D3DPT_POINTLIST &&
        renderState?.pointSpriteEnable !== 0)) {
    return null;
  }
  const cutout = implicitAlphaCutoutThreshold >= 0;
  if (cutout && implicitAlphaCutoutThreshold !== (1 / 255)) {
    return null;
  }
  const usesTexture = d3d8SimpleFFKindUsesTexture(fragmentKind);
  if (usesTexture && (texture0SemanticMode !== 0 ||
      d3dDwordToFloat(renderState.textureStages[0].mipMapLodBias) !== 0)) {
    return null;
  }
  return `fast${cutout ? "-cutout" : ""}` +
    `${usesTexture && texture0FlipY ? "-flip-y" : ""}`;
}

// Location table shared by the fixed-function draw program and the translated
// SM1 shader-pair programs (absent uniforms resolve to null; every cached
// uniform setter tolerates that).
function buildD3D8DrawProgramLocations(program) {
  const locations = {
    program,
    position: gl.getAttribLocation(program, "aPosition"),
    normal: gl.getAttribLocation(program, "aNormal"),
    diffuse: gl.getAttribLocation(program, "aDiffuseBgra"),
    specular: gl.getAttribLocation(program, "aSpecularBgra"),
    texCoord0: gl.getAttribLocation(program, "aTexCoord0"),
    texCoord1: gl.getAttribLocation(program, "aTexCoord1"),
    scale: gl.getUniformLocation(program, "uScale"),
    useTransforms: gl.getUniformLocation(program, "uUseTransforms"),
    pretransformedPosition: gl.getUniformLocation(program, "uPretransformedPosition"),
    d3dViewport: gl.getUniformLocation(program, "uD3DViewport"),
    world: gl.getUniformLocation(program, "uWorld"),
    worldNormalMatrix: gl.getUniformLocation(program, "uWorldNormalMatrix"),
    view: gl.getUniformLocation(program, "uView"),
    projection: gl.getUniformLocation(program, "uProjection"),
    depthBias: gl.getUniformLocation(program, "uDepthBias"),
    clipPlaneMask: gl.getUniformLocation(program, "uClipPlaneMask"),
    clipPlanes: gl.getUniformLocation(program, "uClipPlanes[0]"),
    useFlatShade: gl.getUniformLocation(program, "uUseFlatShade"),
    texture0CoordinateMode: gl.getUniformLocation(program, "uTexture0CoordinateMode"),
    useTexture0Transform: gl.getUniformLocation(program, "uUseTexture0Transform"),
    texture0Transform: gl.getUniformLocation(program, "uTexture0Transform"),
    texture0TransformComponentCount: gl.getUniformLocation(program, "uTexture0TransformComponentCount"),
    texture0TransformProjected: gl.getUniformLocation(program, "uTexture0TransformProjected"),
    texture1CoordinateMode: gl.getUniformLocation(program, "uTexture1CoordinateMode"),
    useTexture1Transform: gl.getUniformLocation(program, "uUseTexture1Transform"),
    texture1Transform: gl.getUniformLocation(program, "uTexture1Transform"),
    texture1TransformComponentCount: gl.getUniformLocation(program, "uTexture1TransformComponentCount"),
    texture1TransformProjected: gl.getUniformLocation(program, "uTexture1TransformProjected"),
    treeShroudGen: gl.getUniformLocation(program, "uTreeShroudGen"),
    treeShroudOffset: gl.getUniformLocation(program, "uTreeShroudOffset"),
    treeShroudScale: gl.getUniformLocation(program, "uTreeShroudScale"),
    texture2CoordinateMode: gl.getUniformLocation(program, "uTexture2CoordinateMode"),
    texture2CoordSet: gl.getUniformLocation(program, "uTexture2CoordSet"),
    useTexture2Transform: gl.getUniformLocation(program, "uUseTexture2Transform"),
    texture2Transform: gl.getUniformLocation(program, "uTexture2Transform"),
    texture2TransformComponentCount: gl.getUniformLocation(program, "uTexture2TransformComponentCount"),
    texture2TransformProjected: gl.getUniformLocation(program, "uTexture2TransformProjected"),
    texture3CoordinateMode: gl.getUniformLocation(program, "uTexture3CoordinateMode"),
    texture3CoordSet: gl.getUniformLocation(program, "uTexture3CoordSet"),
    useTexture3Transform: gl.getUniformLocation(program, "uUseTexture3Transform"),
    texture3Transform: gl.getUniformLocation(program, "uTexture3Transform"),
    texture3TransformComponentCount: gl.getUniformLocation(program, "uTexture3TransformComponentCount"),
    texture3TransformProjected: gl.getUniformLocation(program, "uTexture3TransformProjected"),
    pointSize: gl.getUniformLocation(program, "uPointSize"),
    pointSizeMin: gl.getUniformLocation(program, "uPointSizeMin"),
    pointSizeMax: gl.getUniformLocation(program, "uPointSizeMax"),
    pointScaleEnable: gl.getUniformLocation(program, "uPointScaleEnable"),
    pointScaleA: gl.getUniformLocation(program, "uPointScaleA"),
    pointScaleB: gl.getUniformLocation(program, "uPointScaleB"),
    pointScaleC: gl.getUniformLocation(program, "uPointScaleC"),
    pointViewportHeight: gl.getUniformLocation(program, "uPointViewportHeight"),
    lightingEnabled: gl.getUniformLocation(program, "uLightingEnabled"),
    specularEnabled: gl.getUniformLocation(program, "uSpecularEnabled"),
    normalizeNormals: gl.getUniformLocation(program, "uNormalizeNormals"),
    localViewer: gl.getUniformLocation(program, "uLocalViewer"),
    colorVertexEnabled: gl.getUniformLocation(program, "uColorVertexEnabled"),
    sceneAmbient: gl.getUniformLocation(program, "uSceneAmbient"),
    materialDiffuse: gl.getUniformLocation(program, "uMaterialDiffuse"),
    materialAmbient: gl.getUniformLocation(program, "uMaterialAmbient"),
    materialSpecular: gl.getUniformLocation(program, "uMaterialSpecular"),
    materialEmissive: gl.getUniformLocation(program, "uMaterialEmissive"),
    materialPower: gl.getUniformLocation(program, "uMaterialPower"),
    diffuseMaterialSource: gl.getUniformLocation(program, "uDiffuseMaterialSource"),
    specularMaterialSource: gl.getUniformLocation(program, "uSpecularMaterialSource"),
    ambientMaterialSource: gl.getUniformLocation(program, "uAmbientMaterialSource"),
    emissiveMaterialSource: gl.getUniformLocation(program, "uEmissiveMaterialSource"),
    fixedLightCount: gl.getUniformLocation(program, "uFixedLightCount"),
    fixedLightType: gl.getUniformLocation(program, "uFixedLightType[0]"),
    fixedLightDiffuse: gl.getUniformLocation(program, "uFixedLightDiffuse[0]"),
    fixedLightSpecular: gl.getUniformLocation(program, "uFixedLightSpecular[0]"),
    fixedLightAmbient: gl.getUniformLocation(program, "uFixedLightAmbient[0]"),
    fixedLightPosition: gl.getUniformLocation(program, "uFixedLightPosition[0]"),
    fixedLightDirection: gl.getUniformLocation(program, "uFixedLightDirection[0]"),
    fixedLightRangeAttenuation: gl.getUniformLocation(program, "uFixedLightRangeAttenuation[0]"),
    fixedLightSpot: gl.getUniformLocation(program, "uFixedLightSpot[0]"),
    useTexture0: gl.getUniformLocation(program, "uUseTexture0"),
    drawingPoints: gl.getUniformLocation(program, "uDrawingPoints"),
    pointSpriteEnable: gl.getUniformLocation(program, "uPointSpriteEnable"),
    texture0: gl.getUniformLocation(program, "uTexture0"),
    texture0LodBias: gl.getUniformLocation(program, "uTexture0LodBias"),
    texture0Semantic: gl.getUniformLocation(program, "uTexture0Semantic"),
    texture0FlipY: gl.getUniformLocation(program, "uTexture0FlipY"),
    useTexture1: gl.getUniformLocation(program, "uUseTexture1"),
    texture1: gl.getUniformLocation(program, "uTexture1"),
    texture1LodBias: gl.getUniformLocation(program, "uTexture1LodBias"),
    texture1Semantic: gl.getUniformLocation(program, "uTexture1Semantic"),
    texture1FlipY: gl.getUniformLocation(program, "uTexture1FlipY"),
    useTexture2: gl.getUniformLocation(program, "uUseTexture2"),
    texture2: gl.getUniformLocation(program, "uTexture2"),
    texture2LodBias: gl.getUniformLocation(program, "uTexture2LodBias"),
    texture2Semantic: gl.getUniformLocation(program, "uTexture2Semantic"),
    texture2FlipY: gl.getUniformLocation(program, "uTexture2FlipY"),
    useTexture3: gl.getUniformLocation(program, "uUseTexture3"),
    texture3: gl.getUniformLocation(program, "uTexture3"),
    texture3LodBias: gl.getUniformLocation(program, "uTexture3LodBias"),
    texture3Semantic: gl.getUniformLocation(program, "uTexture3Semantic"),
    texture3FlipY: gl.getUniformLocation(program, "uTexture3FlipY"),
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
    stage1AlphaOp: gl.getUniformLocation(program, "uStage1AlphaOp"),
    stage1AlphaArg0: gl.getUniformLocation(program, "uStage1AlphaArg0"),
    stage1AlphaArg1: gl.getUniformLocation(program, "uStage1AlphaArg1"),
    stage1AlphaArg2: gl.getUniformLocation(program, "uStage1AlphaArg2"),
    stage1ResultArg: gl.getUniformLocation(program, "uStage1ResultArg"),
    stage2ColorOp: gl.getUniformLocation(program, "uStage2ColorOp"),
    stage2ColorArg0: gl.getUniformLocation(program, "uStage2ColorArg0"),
    stage2ColorArg1: gl.getUniformLocation(program, "uStage2ColorArg1"),
    stage2ColorArg2: gl.getUniformLocation(program, "uStage2ColorArg2"),
    stage2AlphaOp: gl.getUniformLocation(program, "uStage2AlphaOp"),
    stage2AlphaArg0: gl.getUniformLocation(program, "uStage2AlphaArg0"),
    stage2AlphaArg1: gl.getUniformLocation(program, "uStage2AlphaArg1"),
    stage2AlphaArg2: gl.getUniformLocation(program, "uStage2AlphaArg2"),
    stage2ResultArg: gl.getUniformLocation(program, "uStage2ResultArg"),
    stage3ColorOp: gl.getUniformLocation(program, "uStage3ColorOp"),
    stage3ColorArg0: gl.getUniformLocation(program, "uStage3ColorArg0"),
    stage3ColorArg1: gl.getUniformLocation(program, "uStage3ColorArg1"),
    stage3ColorArg2: gl.getUniformLocation(program, "uStage3ColorArg2"),
    stage3AlphaOp: gl.getUniformLocation(program, "uStage3AlphaOp"),
    stage3AlphaArg0: gl.getUniformLocation(program, "uStage3AlphaArg0"),
    stage3AlphaArg1: gl.getUniformLocation(program, "uStage3AlphaArg1"),
    stage3AlphaArg2: gl.getUniformLocation(program, "uStage3AlphaArg2"),
    stage3ResultArg: gl.getUniformLocation(program, "uStage3ResultArg"),
    alphaTestEnabled: gl.getUniformLocation(program, "uAlphaTestEnabled"),
    alphaFunc: gl.getUniformLocation(program, "uAlphaFunc"),
    alphaRef: gl.getUniformLocation(program, "uAlphaRef"),
    implicitAlphaCutoutThreshold: gl.getUniformLocation(program, "uImplicitAlphaCutoutThreshold"),
    fogEnabled: gl.getUniformLocation(program, "uFogEnabled"),
    fogRangeEnabled: gl.getUniformLocation(program, "uFogRangeEnabled"),
    fogColor: gl.getUniformLocation(program, "uFogColor"),
    fogStart: gl.getUniformLocation(program, "uFogStart"),
    fogEnd: gl.getUniformLocation(program, "uFogEnd"),
  };
  locations.extendedTextureStageUniforms = [2, 3].map((stageIndex) => {
    const prefix = `texture${stageIndex}`;
    return {
      samplerUnit: stageIndex,
      coordinateMode: locations[`${prefix}CoordinateMode`],
      coordSet: locations[`${prefix}CoordSet`],
      useTransform: locations[`useTexture${stageIndex}Transform`],
      transform: locations[`${prefix}Transform`],
      transformComponentCount: locations[`${prefix}TransformComponentCount`],
      transformProjected: locations[`${prefix}TransformProjected`],
      useTexture: locations[`useTexture${stageIndex}`],
      sampler: locations[prefix],
      lodBias: locations[`${prefix}LodBias`],
      semantic: locations[`${prefix}Semantic`],
      flipY: locations[`${prefix}FlipY`],
    };
  });
  locations.extendedCombinerStageUniforms = [2, 3].map((stageIndex) => {
    const prefix = `stage${stageIndex}`;
    return {
      colorOp: locations[`${prefix}ColorOp`],
      colorArg0: locations[`${prefix}ColorArg0`],
      colorArg1: locations[`${prefix}ColorArg1`],
      colorArg2: locations[`${prefix}ColorArg2`],
      alphaOp: locations[`${prefix}AlphaOp`],
      alphaArg0: locations[`${prefix}AlphaArg0`],
      alphaArg1: locations[`${prefix}AlphaArg1`],
      alphaArg2: locations[`${prefix}AlphaArg2`],
      resultArg: locations[`${prefix}ResultArg`],
    };
  });
  return locations;
}

function uploadD3D8ExtendedTextureStageUniforms(locations, textureStage,
    canSample, coordinates, transform, semantic, flipY) {
  if (!locations.coordinateMode && !locations.useTexture) {
    return;
  }
  const transformApplied = Boolean(canSample && coordinates.transformApplied);
  if (locations.coordinateMode) {
    d3d8CachedUniform1i(
      locations.coordinateMode,
      canSample ? coordinates.mode : D3DTSS_TCI_PASSTHRU,
    );
  }
  if (locations.coordSet) {
    d3d8CachedUniform1i(locations.coordSet, canSample ? (coordinates.coordSet >>> 0) : 0);
  }
  if (locations.useTransform) {
    d3d8CachedUniform1i(locations.useTransform, transformApplied ? 1 : 0);
  }
  if (locations.transformComponentCount) {
    d3d8CachedUniform1i(
      locations.transformComponentCount,
      transformApplied ? coordinates.textureTransformComponentCount : 0,
    );
  }
  if (locations.transformProjected) {
    d3d8CachedUniform1i(
      locations.transformProjected,
      transformApplied && coordinates.textureTransformProjected ? 1 : 0,
    );
  }
  if (locations.transform && transformApplied) {
    d3d8CachedUniformMatrix4fv(locations.transform, transform);
  }
  if (locations.useTexture) {
    d3d8CachedUniform1i(locations.useTexture, canSample ? 1 : 0);
  }
  if (locations.sampler) {
    d3d8CachedUniform1i(locations.sampler, locations.samplerUnit);
  }
  if (locations.lodBias) {
    d3d8CachedUniform1f(
      locations.lodBias,
      canSample
        ? d3dDwordToFloat(textureStage.mipMapLodBias)
        : 0.0,
    );
  }
  if (locations.semantic) {
    d3d8CachedUniform1i(locations.semantic, semantic);
  }
  if (locations.flipY) {
    d3d8CachedUniform1i(locations.flipY, flipY ? 1 : 0);
  }
}

function uploadD3D8ExtendedCombinerStageUniforms(locations, textureStage) {
  if (!locations.colorOp) {
    return;
  }
  d3d8CachedUniform1i(locations.colorOp, textureStage.colorOp);
  d3d8CachedUniform1i(locations.colorArg0, textureStage.colorArg0);
  d3d8CachedUniform1i(locations.colorArg1, textureStage.colorArg1);
  d3d8CachedUniform1i(locations.colorArg2, textureStage.colorArg2);
  d3d8CachedUniform1i(locations.alphaOp, textureStage.alphaOp);
  d3d8CachedUniform1i(locations.alphaArg0, textureStage.alphaArg0);
  d3d8CachedUniform1i(locations.alphaArg1, textureStage.alphaArg1);
  d3d8CachedUniform1i(locations.alphaArg2, textureStage.alphaArg2);
  d3d8CachedUniform1i(locations.resultArg, textureStage.resultArg);
}

// --- D3D8 SM1 (vs.1.1 / ps.1.x) token stream -> GLSL ES 3.00 translation ---
// The wasm shim registers each CreatePixelShader/CreateVertexShader token
// stream here (cncPortD3D8ShaderCreate). Streams are parsed to a small IR at
// registration; GLSL is emitted per linked (vertexShader, pixelShader) pair so
// the varying interface can adapt (fixed-function vertex stage feeding a
// translated fragment stage vs a fully translated pair). Semantics follow the
// DirectX 8.1 SDK shader reference (assets/docs/graphics/dx8-sdk-docs);
// bytecode layout cross-checked against WineD3D's SM1 frontend.

const D3D8_SM1_OPCODES = new Map([
  [0, { name: "nop", dst: 0, srcs: 0 }],
  [1, { name: "mov", dst: 1, srcs: 1 }],
  [2, { name: "add", dst: 1, srcs: 2 }],
  [3, { name: "sub", dst: 1, srcs: 2 }],
  [4, { name: "mad", dst: 1, srcs: 3 }],
  [5, { name: "mul", dst: 1, srcs: 2 }],
  [6, { name: "rcp", dst: 1, srcs: 1 }],
  [7, { name: "rsq", dst: 1, srcs: 1 }],
  [8, { name: "dp3", dst: 1, srcs: 2 }],
  [9, { name: "dp4", dst: 1, srcs: 2 }],
  [10, { name: "min", dst: 1, srcs: 2 }],
  [11, { name: "max", dst: 1, srcs: 2 }],
  [12, { name: "slt", dst: 1, srcs: 2 }],
  [13, { name: "sge", dst: 1, srcs: 2 }],
  [14, { name: "exp", dst: 1, srcs: 1 }],
  [15, { name: "log", dst: 1, srcs: 1 }],
  [16, { name: "lit", dst: 1, srcs: 1 }],
  [17, { name: "dst", dst: 1, srcs: 2 }],
  [18, { name: "lrp", dst: 1, srcs: 3 }],
  [19, { name: "frc", dst: 1, srcs: 1 }],
  [20, { name: "m4x4", dst: 1, srcs: 2 }],
  [21, { name: "m4x3", dst: 1, srcs: 2 }],
  [22, { name: "m3x4", dst: 1, srcs: 2 }],
  [23, { name: "m3x3", dst: 1, srcs: 2 }],
  [24, { name: "m3x2", dst: 1, srcs: 2 }],
  [64, { name: "texcoord", dst: 1, srcs: 0 }],
  [65, { name: "texkill", dst: 1, srcs: 0 }],
  [66, { name: "tex", dst: 1, srcs: 0 }],
  [67, { name: "texbem", dst: 1, srcs: 1 }],
  [68, { name: "texbeml", dst: 1, srcs: 1 }],
  [78, { name: "expp", dst: 1, srcs: 1 }],
  [79, { name: "logp", dst: 1, srcs: 1 }],
  [80, { name: "cnd", dst: 1, srcs: 3 }],
  [81, { name: "def", dst: 1, srcs: 0, floats: 4 }],
  [88, { name: "cmp", dst: 1, srcs: 3 }],
]);

function d3d8SM1DecodeParam(token) {
  return {
    regType: (token >>> 28) & 0x7,
    regNum: token & 0x7ff,
    // Destination fields
    writeMask: (token >>> 16) & 0xf,
    shift: (token >>> 24) & 0xf,
    saturate: (token & 0x00100000) !== 0,
    // Source fields
    swizzle: (token >>> 16) & 0xff,
    modifier: (token >>> 24) & 0xf,
    relative: (token & 0x2000) !== 0,
  };
}

// Parses a D3D8 SM1 token stream to IR. Returns null (with a console warning)
// for anything outside the supported subset so the shim can report failure
// and the engine can take its original fixed-function fallback.
function parseD3D8SM1Tokens(tokens) {
  if (!tokens || tokens.length < 2) {
    return null;
  }
  const version = tokens[0] >>> 0;
  const versionKind = (version & 0xffff0000) >>> 0;
  const isPixel = versionKind === 0xffff0000;
  const isVertex = versionKind === 0xfffe0000;
  if (!isPixel && !isVertex) {
    return null;
  }
  const major = (version >>> 8) & 0xff;
  const minor = version & 0xff;
  if (major !== 1) {
    console.warn(`D3D8 SM1: unsupported shader model ${major}.${minor}`);
    return null;
  }
  if (isPixel && minor >= 4) {
    // ps.1.4 has phase/texld semantics this translator does not model; the
    // shipped Generals/Zero Hour corpus is entirely ps.1.1.
    console.warn("D3D8 SM1: ps.1.4 shaders are not supported");
    return null;
  }
  const instructions = [];
  let index = 1;
  while (index < tokens.length) {
    const token = tokens[index] >>> 0;
    if (token === 0x0000ffff) {
      return { isPixel, major, minor, instructions };
    }
    if ((token & 0xffff) === 0xfffe) { // comment block
      index += 1 + ((token >>> 16) & 0x7fff);
      continue;
    }
    const opcode = token & 0xffff;
    const info = D3D8_SM1_OPCODES.get(opcode);
    if (!info) {
      console.warn(`D3D8 SM1: unsupported opcode ${opcode}`);
      return null;
    }
    const instruction = {
      opcode,
      name: info.name,
      coissue: (token & 0x40000000) !== 0,
      dst: null,
      srcs: [],
      floats: null,
    };
    index += 1;
    if (info.dst) {
      instruction.dst = d3d8SM1DecodeParam(tokens[index] >>> 0);
      index += 1;
    }
    for (let s = 0; s < info.srcs; s += 1) {
      instruction.srcs.push(d3d8SM1DecodeParam(tokens[index] >>> 0));
      index += 1;
    }
    if (info.floats) {
      const floatView = new Float32Array(tokens.buffer, tokens.byteOffset + index * 4, info.floats);
      instruction.floats = Array.from(floatView);
      index += info.floats;
    }
    instructions.push(instruction);
  }
  console.warn("D3D8 SM1: token stream missing END token");
  return null;
}

const D3D8_SM1_COMPONENTS = ["x", "y", "z", "w"];

function d3d8SM1SwizzleSuffix(swizzle) {
  if (swizzle === 0xe4) {
    return "";
  }
  let suffix = ".";
  for (let c = 0; c < 4; c += 1) {
    suffix += D3D8_SM1_COMPONENTS[(swizzle >>> (c * 2)) & 0x3];
  }
  return suffix;
}

function d3d8SM1WriteMaskSuffix(mask) {
  let suffix = "";
  for (let c = 0; c < 4; c += 1) {
    if (mask & (1 << c)) {
      suffix += D3D8_SM1_COMPONENTS[c];
    }
  }
  return suffix;
}

// Source register value expression (before swizzle/modifier), per shader kind.
function d3d8SM1RegisterExpr(param, ctx) {
  const n = param.regNum;
  if (ctx.isPixel) {
    switch (param.regType) {
      case 0: return `psR${n}`;
      case 1: return `psV${n}`;
      case 2:
        ctx.usedConstants.add(n);
        return ctx.defConstants.has(n) ? `psC${n}` : `uPsConst[${n}]`;
      case 3:
        ctx.usedTexRegisters.add(n);
        return `psT${n}`;
      default:
        throw new Error(`ps: unsupported source register type ${param.regType}`);
    }
  }
  switch (param.regType) {
    case 0: ctx.usedTemps.add(n); return `vsR${n}`;
    case 1: ctx.usedInputs.add(n); return `vsV${n}`;
    case 2:
      if (param.relative) {
        ctx.usesAddress = true;
        return `uVsConst[vsA0 + ${n}]`;
      }
      return `uVsConst[${n}]`;
    case 3: ctx.usesAddress = true; return "vec4(float(vsA0))";
    default:
      throw new Error(`vs: unsupported source register type ${param.regType}`);
  }
}

// vs matrix macros need the constant register file with an offset applied.
function d3d8SM1OffsetConstExpr(param, offset) {
  if (param.regType !== 2) {
    throw new Error("SM1 matrix op source must be a constant register");
  }
  if (param.relative) {
    return `uVsConst[vsA0 + ${param.regNum + offset}]`;
  }
  return `uVsConst[${param.regNum + offset}]`;
}

function d3d8SM1SourceExpr(param, ctx) {
  let expr = d3d8SM1RegisterExpr(param, ctx) + d3d8SM1SwizzleSuffix(param.swizzle);
  switch (param.modifier) {
    case 0: break;
    case 1: expr = `(-(${expr}))`; break;                        // negate
    case 2: expr = `((${expr}) - 0.5)`; break;                   // bias
    case 3: expr = `(-((${expr}) - 0.5))`; break;                // bias + negate
    case 4: expr = `(((${expr}) - 0.5) * 2.0)`; break;           // _bx2 (signed scale)
    case 5: expr = `(-(((${expr}) - 0.5) * 2.0))`; break;        // _bx2 + negate
    case 6: expr = `(1.0 - (${expr}))`; break;                   // complement
    case 7: expr = `((${expr}) * 2.0)`; break;                   // _x2 (ps.1.4)
    case 8: expr = `(-((${expr}) * 2.0))`; break;                // _x2 + negate
    default:
      throw new Error(`SM1: unsupported source modifier ${param.modifier}`);
  }
  return expr;
}

function d3d8SM1ArithmeticExpr(instruction, ctx) {
  const s = instruction.srcs.map((src) => d3d8SM1SourceExpr(src, ctx));
  switch (instruction.name) {
    case "mov": return s[0];
    case "add": return `(${s[0]} + ${s[1]})`;
    case "sub": return `(${s[0]} - ${s[1]})`;
    case "mul": return `(${s[0]} * ${s[1]})`;
    case "mad": return `(${s[0]} * ${s[1]} + ${s[2]})`;
    case "dp3": return `vec4(dot((${s[0]}).xyz, (${s[1]}).xyz))`;
    case "dp4": return `vec4(dot(${s[0]}, ${s[1]}))`;
    case "min": return `min(${s[0]}, ${s[1]})`;
    case "max": return `max(${s[0]}, ${s[1]})`;
    case "slt": return `vec4(lessThan(${s[0]}, ${s[1]}))`;
    case "sge": return `vec4(greaterThanEqual(${s[0]}, ${s[1]}))`;
    case "frc": return `fract(${s[0]})`;
    case "rcp": return `vec4(1.0 / (${s[0]}).x)`;
    case "rsq": return `vec4(inversesqrt(max(abs((${s[0]}).x), 1.0e-12)))`;
    case "exp": case "expp": return `vec4(exp2((${s[0]}).x))`;
    case "log": case "logp": return `vec4(log2(max(abs((${s[0]}).x), 1.0e-12)))`;
    case "dst": return `vec4(1.0, (${s[0]}).y * (${s[1]}).y, (${s[0]}).z, (${s[1]}).w)`;
    case "lit": return `d3dSM1Lit(${s[0]})`;
    // lrp d, s0, s1, s2 = s0*s1 + (1-s0)*s2
    case "lrp": return `mix(${s[2]}, ${s[1]}, ${s[0]})`;
    // cnd d, s0, s1, s2 = s0 > 0.5 ? s1 : s2 (per component)
    case "cnd": return `mix(${s[2]}, ${s[1]}, vec4(greaterThan(${s[0]}, vec4(0.5))))`;
    // cmp d, s0, s1, s2 = s0 >= 0 ? s1 : s2 (per component)
    case "cmp": return `mix(${s[2]}, ${s[1]}, vec4(greaterThanEqual(${s[0]}, vec4(0.0))))`;
    case "m4x4": {
      const v = s[0];
      const c = instruction.srcs[1];
      return `vec4(dot(${v}, ${d3d8SM1OffsetConstExpr(c, 0)}), dot(${v}, ${d3d8SM1OffsetConstExpr(c, 1)}), ` +
        `dot(${v}, ${d3d8SM1OffsetConstExpr(c, 2)}), dot(${v}, ${d3d8SM1OffsetConstExpr(c, 3)}))`;
    }
    case "m4x3": {
      const v = s[0];
      const c = instruction.srcs[1];
      return `vec4(dot(${v}, ${d3d8SM1OffsetConstExpr(c, 0)}), dot(${v}, ${d3d8SM1OffsetConstExpr(c, 1)}), ` +
        `dot(${v}, ${d3d8SM1OffsetConstExpr(c, 2)}), 0.0)`;
    }
    case "m3x4": {
      const v = `(${s[0]}).xyz`;
      const c = instruction.srcs[1];
      return `vec4(dot(${v}, ${d3d8SM1OffsetConstExpr(c, 0)}.xyz), dot(${v}, ${d3d8SM1OffsetConstExpr(c, 1)}.xyz), ` +
        `dot(${v}, ${d3d8SM1OffsetConstExpr(c, 2)}.xyz), dot(${v}, ${d3d8SM1OffsetConstExpr(c, 3)}.xyz))`;
    }
    case "m3x3": {
      const v = `(${s[0]}).xyz`;
      const c = instruction.srcs[1];
      return `vec4(dot(${v}, ${d3d8SM1OffsetConstExpr(c, 0)}.xyz), dot(${v}, ${d3d8SM1OffsetConstExpr(c, 1)}.xyz), ` +
        `dot(${v}, ${d3d8SM1OffsetConstExpr(c, 2)}.xyz), 0.0)`;
    }
    case "m3x2": {
      const v = `(${s[0]}).xyz`;
      const c = instruction.srcs[1];
      return `vec4(dot(${v}, ${d3d8SM1OffsetConstExpr(c, 0)}.xyz), dot(${v}, ${d3d8SM1OffsetConstExpr(c, 1)}.xyz), 0.0, 0.0)`;
    }
    default:
      throw new Error(`SM1: no expression for ${instruction.name}`);
  }
}

function d3d8SM1ApplyDestModifiers(expr, dst) {
  let out = expr;
  switch (dst.shift) {
    case 0: break;
    case 1: out = `((${out}) * 2.0)`; break;
    case 2: out = `((${out}) * 4.0)`; break;
    case 3: out = `((${out}) * 8.0)`; break;
    case 0xf: out = `((${out}) * 0.5)`; break;
    case 0xe: out = `((${out}) * 0.25)`; break;
    case 0xd: out = `((${out}) * 0.125)`; break;
    default:
      throw new Error(`SM1: unsupported destination shift ${dst.shift}`);
  }
  if (dst.saturate) {
    out = `clamp(${out}, 0.0, 1.0)`;
  }
  return out;
}

function d3d8SM1DestName(dst, ctx) {
  if (ctx.isPixel) {
    switch (dst.regType) {
      case 0: return `psR${dst.regNum}`;
      case 3: ctx.usedTexRegisters.add(dst.regNum); return `psT${dst.regNum}`;
      default:
        throw new Error(`ps: unsupported destination register type ${dst.regType}`);
    }
  }
  switch (dst.regType) {
    case 0: ctx.usedTemps.add(dst.regNum); return `vsR${dst.regNum}`;
    case 3: ctx.usesAddress = true; return "vsA0"; // handled specially by mov
    case 4:
      if (dst.regNum === 0) { ctx.writesPosition = true; return "vsOPos"; }
      if (dst.regNum === 1) { ctx.writesFog = true; return "vsOFog"; }
      return "vsOPts";
    case 5: ctx.usedColorOutputs.add(dst.regNum); return `vsOD${dst.regNum}`;
    case 6: ctx.usedTexOutputs.add(dst.regNum); return `vsOT${dst.regNum}`;
    default:
      throw new Error(`vs: unsupported destination register type ${dst.regType}`);
  }
}

function d3d8SM1WriteStatement(dst, valueExpr, ctx) {
  const destName = d3d8SM1DestName(dst, ctx);
  if (!ctx.isPixel && dst.regType === 3) {
    // mov a0.x — D3D8 vs.1.1 address loads use floor semantics.
    return `vsA0 = int(floor((${valueExpr}).x));`;
  }
  let finalExpr = d3d8SM1ApplyDestModifiers(valueExpr, dst);
  if (ctx.isPixel && !dst.saturate) {
    // ps.1.x register saturation: every arithmetic result is clamped to
    // [-MaxPixelShaderValue, +MaxPixelShaderValue] (= [-1, 1] per the caps we
    // report) BEFORE it can be read back. Skipping this lets intermediates
    // overshoot 1.0 and re-enter later instructions (e.g. the water shaders'
    // sparkle mad feeding a shroud mul), rendering brighter than hardware.
    finalExpr = `clamp(${finalExpr}, -1.0, 1.0)`;
  }
  if (dst.writeMask === 0xf) {
    return `${destName} = ${finalExpr};`;
  }
  const mask = d3d8SM1WriteMaskSuffix(dst.writeMask);
  return `${destName}.${mask} = (${finalExpr}).${mask};`;
}

// Stage texture sample honoring the same semantic/LOD-bias plumbing as the
// fixed-function fragment stage. Unbound stages sample opaque black (D3D8).
function d3d8SM1SampleExpr(stage, coordExpr, ctx) {
  if (ctx.staticFixedFunctionState) {
    return `texture(uTexture${stage}, ${coordExpr})`;
  }
  return `(uUseTexture${stage} ? d3dTextureSample(texture(uTexture${stage}, ` +
    `d3dTextureCoordinate(${coordExpr}, uTexture${stage}FlipY), ` +
    `uTexture${stage}LodBias), uTexture${stage}Semantic) : vec4(0.0, 0.0, 0.0, 1.0))`;
}

// Emits the pixel-shader instruction body (statement list) for a parsed IR.
function d3d8SM1EmitPixelBody(ir, ctx) {
  const lines = [];
  const instructions = ir.instructions;
  for (let i = 0; i < instructions.length; i += 1) {
    const instruction = instructions[i];
    const stage = instruction.dst ? instruction.dst.regNum : 0;
    switch (instruction.name) {
      case "nop":
        continue;
      case "def": {
        ctx.defConstants.set(instruction.dst.regNum, instruction.floats);
        continue;
      }
      case "tex":
        ctx.usedTexRegisters.add(stage);
        ctx.sampledStages.add(stage);
        lines.push(`psT${stage} = ${d3d8SM1SampleExpr(stage, `vTexCoord${stage}`, ctx)};`);
        continue;
      case "texcoord":
        ctx.usedTexRegisters.add(stage);
        lines.push(`psT${stage} = vec4(clamp(vTexCoord${stage}, 0.0, 1.0), 0.0, 1.0);`);
        continue;
      case "texkill":
        lines.push(`if (any(lessThan(vTexCoord${stage}, vec2(0.0)))) { discard; }`);
        continue;
      case "texbem":
      case "texbeml": {
        ctx.usedTexRegisters.add(stage);
        ctx.sampledStages.add(stage);
        ctx.usesBumpEnv = true;
        const src = d3d8SM1SourceExpr(instruction.srcs[0], ctx);
        // D3D8 texbem: u' = u + du*M00 + dv*M10, v' = v + du*M01 + dv*M11
        // with (du, dv) = source.rg and M packed as uBumpEnv[stage] =
        // (m00, m01, m10, m11).
        const coord = `(vTexCoord${stage} + vec2(` +
          `dot(vec2(uBumpEnv[${stage}].x, uBumpEnv[${stage}].z), (${src}).xy), ` +
          `dot(vec2(uBumpEnv[${stage}].y, uBumpEnv[${stage}].w), (${src}).xy)))`;
        let sample = d3d8SM1SampleExpr(stage, coord, ctx);
        if (instruction.name === "texbeml") {
          ctx.usesBumpEnvL = true;
          sample = `((${sample}) * ((${src}).z * uBumpEnvL[${stage}].x + uBumpEnvL[${stage}].y))`;
        }
        lines.push(`psT${stage} = ${sample};`);
        continue;
      }
      default:
        break;
    }
    // Arithmetic. Co-issued pairs (rgb op + alpha op) read their sources
    // before either result lands, so compute both into temporaries first.
    const next = instructions[i + 1];
    if (next && next.coissue && instruction.dst && next.dst) {
      const exprA = d3d8SM1ArithmeticExpr(instruction, ctx);
      const exprB = d3d8SM1ArithmeticExpr(next, ctx);
      lines.push(`vec4 psCo${i}A = ${exprA};`);
      lines.push(`vec4 psCo${i}B = ${exprB};`);
      lines.push(d3d8SM1WriteStatement(instruction.dst, `psCo${i}A`, ctx));
      lines.push(d3d8SM1WriteStatement(next.dst, `psCo${i}B`, ctx));
      i += 1;
      continue;
    }
    lines.push(d3d8SM1WriteStatement(instruction.dst, d3d8SM1ArithmeticExpr(instruction, ctx), ctx));
  }
  return lines;
}

// Builds the complete fragment shader source for a translated pixel shader.
// options.translatedVs selects the varying interface: fixed-function vertex
// pairs get the FF varyings (clip planes, depth fog); translated-vs pairs get
// the SM1 vertex outputs (oFog-driven fog, no user clip planes).
function d3d8SM1BuildFragmentSource(psShader, options) {
  const ctx = {
    isPixel: true,
    usedConstants: new Set(),
    usedTexRegisters: new Set(),
    sampledStages: new Set(),
    defConstants: new Map(),
    usesBumpEnv: false,
    usesBumpEnvL: false,
    staticFixedFunctionState: options.staticFixedFunctionState === true,
  };
  const body = d3d8SM1EmitPixelBody(psShader.ir, ctx);
  const lines = [];
  lines.push("#version 300 es");
  // ps.1.x was an 8-bit-era shader model. Static fixed-function pairings can
  // use GLES mediump without losing any precision exposed by D3D8, and mobile
  // GPUs can execute the packed arithmetic much more efficiently.
  lines.push(ctx.staticFixedFunctionState
    ? "precision mediump float;"
    : "precision highp float;");
  lines.push("in vec4 vColor;");
  lines.push("in vec4 vSpecularColor;");
  lines.push("flat in vec4 vFlatColor;");
  for (let stage = 0; stage < 4; stage += 1) {
    lines.push(`in vec2 vTexCoord${stage};`);
  }
  if (options.translatedVs) {
    if (options.vsWritesFog) {
      lines.push("in float vVsFog;");
    }
  } else {
    lines.push("in vec4 vClipPosition;");
    lines.push("in float vFogDepth;");
    lines.push("in float vFogRangeDistance;");
    lines.push("uniform int uClipPlaneMask;");
    lines.push("uniform vec4 uClipPlanes[6];");
  }
  lines.push("uniform bool uUseFlatShade;");
  for (let stage = 0; stage < 4; stage += 1) {
    lines.push(`uniform sampler2D uTexture${stage};`);
    if (!ctx.staticFixedFunctionState) {
      lines.push(`uniform bool uUseTexture${stage};`);
      lines.push(`uniform float uTexture${stage}LodBias;`);
      lines.push(`uniform int uTexture${stage}Semantic;`);
      lines.push(`uniform bool uTexture${stage}FlipY;`);
    }
  }
  lines.push("uniform vec4 uPsConst[8];");
  if (ctx.usesBumpEnv) {
    lines.push("uniform vec4 uBumpEnv[4];");
  }
  if (ctx.usesBumpEnvL) {
    lines.push("uniform vec2 uBumpEnvL[4];");
  }
  if (!ctx.staticFixedFunctionState) {
    lines.push("uniform bool uAlphaTestEnabled;");
    lines.push("uniform int uAlphaFunc;");
    lines.push("uniform float uAlphaRef;");
    lines.push("uniform bool uFogEnabled;");
    lines.push("uniform bool uFogRangeEnabled;");
    lines.push("uniform vec3 uFogColor;");
    lines.push("uniform float uFogStart;");
    lines.push("uniform float uFogEnd;");
  }
  lines.push("out vec4 fragColor;");
  if (!ctx.staticFixedFunctionState) {
    lines.push("bool d3dAlphaCompare(float value, float reference) {");
    lines.push("  if (uAlphaFunc == 1) { return false; }");
    lines.push("  if (uAlphaFunc == 2) { return value < reference; }");
    lines.push("  if (uAlphaFunc == 3) { return value == reference; }");
    lines.push("  if (uAlphaFunc == 4) { return value <= reference; }");
    lines.push("  if (uAlphaFunc == 5) { return value > reference; }");
    lines.push("  if (uAlphaFunc == 6) { return value != reference; }");
    lines.push("  if (uAlphaFunc == 7) { return value >= reference; }");
    lines.push("  return true;");
    lines.push("}");
  }
  lines.push("vec4 d3dTextureSample(vec4 rawSample, int semantic) {");
  lines.push("  if (semantic == 1) { return vec4(0.0, 0.0, 0.0, rawSample.r); }");
  lines.push("  if (semantic == 2) { return vec4(rawSample.r, rawSample.r, rawSample.r, 1.0); }");
  lines.push("  if (semantic == 3) { return vec4(rawSample.r, rawSample.r, rawSample.r, rawSample.g); }");
  lines.push("  if (semantic == 4) {");
  lines.push("    vec2 signedBump = clamp((rawSample.rg * 255.0 - 128.0) / 127.0, -1.0, 1.0);");
  lines.push("    return vec4(signedBump, 0.0, 1.0);");
  lines.push("  }");
  lines.push("  return rawSample;");
  lines.push("}");
  lines.push("vec2 d3dTextureCoordinate(vec2 coordinate, bool flipY) {");
  lines.push("  return flipY ? vec2(coordinate.x, 1.0 - coordinate.y) : coordinate;");
  lines.push("}");
  lines.push("void main() {");
  if (!options.translatedVs && !ctx.staticFixedFunctionState) {
    lines.push("  for (int index = 0; index < 6; ++index) {");
    lines.push("    if ((uClipPlaneMask & (1 << index)) != 0 && dot(uClipPlanes[index], vClipPosition) < 0.0) {");
    lines.push("      discard;");
    lines.push("    }");
    lines.push("  }");
  }
  // ps.1.x color inputs are clamped to [0, 1] on read.
  lines.push("  vec4 psV0 = clamp(uUseFlatShade ? vFlatColor : vColor, 0.0, 1.0);");
  lines.push("  vec4 psV1 = clamp(vSpecularColor, 0.0, 1.0);");
  lines.push("  vec4 psR0 = vec4(0.0);");
  lines.push("  vec4 psR1 = vec4(0.0);");
  for (const reg of Array.from(ctx.usedTexRegisters).sort()) {
    lines.push(`  vec4 psT${reg} = vec4(0.0);`);
  }
  for (const [reg, values] of ctx.defConstants) {
    lines.push(`  vec4 psC${reg} = vec4(${values.map((v) => Number(v).toFixed(6)).join(", ")});`);
  }
  for (const line of body) {
    lines.push(`  ${line}`);
  }
  lines.push("  vec4 psOut = psR0;");
  // Fidelity debugging: set globalThis.__cncSM1VisualizeStage = N BEFORE the
  // shaders are created (page init script) to render fract(vTexCoordN) instead
  // of the shader result — a direct view of the interpolated texgen coords.
  const visualizeStage = Number(globalThis.__cncSM1VisualizeStage);
  if (Number.isInteger(visualizeStage) && visualizeStage >= 0 && visualizeStage <= 3) {
    lines.push(`  psOut = vec4(fract(vTexCoord${visualizeStage}), 0.0, 1.0);`);
  }
  if (!ctx.staticFixedFunctionState) {
    lines.push("  if (uAlphaTestEnabled && !d3dAlphaCompare(psOut.a, uAlphaRef)) {");
    lines.push("    discard;");
    lines.push("  }");
  }
  if (options.translatedVs) {
    if (options.vsWritesFog) {
      // With a programmable vertex shader D3D8 fog blends by the oFog factor
      // directly (1 = unfogged).
      lines.push("  if (uFogEnabled) {");
      lines.push("    psOut.rgb = mix(uFogColor, psOut.rgb, clamp(vVsFog, 0.0, 1.0));");
      lines.push("  }");
    }
  } else if (!ctx.staticFixedFunctionState) {
    lines.push("  if (uFogEnabled) {");
    lines.push("    float fogDistance = uFogRangeEnabled ? vFogRangeDistance : vFogDepth;");
    lines.push("    float fogAmount = clamp((fogDistance - uFogStart) / max(uFogEnd - uFogStart, 0.000001), 0.0, 1.0);");
    lines.push("    psOut.rgb = mix(psOut.rgb, uFogColor, fogAmount);");
    lines.push("  }");
  }
  lines.push("  fragColor = psOut;");
  lines.push("}");
  return { source: lines.join("\n"), sampledStages: ctx.sampledStages, usesBumpEnv: ctx.usesBumpEnv };
}

// D3DVSDT vertex declaration type -> GL attribute pointer description.
const D3D8_SM1_DECL_TYPES = [
  { size: 1, glType: "FLOAT", normalized: false, bgra: false },   // FLOAT1
  { size: 2, glType: "FLOAT", normalized: false, bgra: false },   // FLOAT2
  { size: 3, glType: "FLOAT", normalized: false, bgra: false },   // FLOAT3
  { size: 4, glType: "FLOAT", normalized: false, bgra: false },   // FLOAT4
  { size: 4, glType: "UNSIGNED_BYTE", normalized: true, bgra: true },  // D3DCOLOR
  { size: 4, glType: "UNSIGNED_BYTE", normalized: false, bgra: false }, // UBYTE4
  { size: 2, glType: "SHORT", normalized: false, bgra: false },   // SHORT2
  { size: 4, glType: "SHORT", normalized: false, bgra: false },   // SHORT4
];

// Builds the complete vertex shader source for a translated SM1 vertex shader.
function d3d8SM1BuildVertexSource(vsShader) {
  const ctx = {
    isPixel: false,
    usedTemps: new Set(),
    usedInputs: new Set(),
    usedColorOutputs: new Set(),
    usedTexOutputs: new Set(),
    usesAddress: false,
    writesPosition: false,
    writesFog: false,
  };
  const body = [];
  const instructions = vsShader.ir.instructions;
  for (const instruction of instructions) {
    if (instruction.name === "nop") {
      continue;
    }
    if (instruction.name === "def") {
      throw new Error("vs def constants not supported");
    }
    body.push(d3d8SM1WriteStatement(instruction.dst, d3d8SM1ArithmeticExpr(instruction, ctx), ctx));
  }
  const declByRegister = new Map();
  for (const entry of vsShader.decl) {
    declByRegister.set(entry.register, entry);
  }
  const lines = [];
  lines.push("#version 300 es");
  for (const entry of vsShader.decl) {
    lines.push(`in vec4 aVs${entry.register};`);
  }
  lines.push("uniform vec4 uVsConst[96];");
  lines.push("uniform float uDepthBias;");
  lines.push("uniform bool uUseXrClipTransform;");
  lines.push("uniform mat4 uXrClipTransform;");
  // Full fixed-function varying interface: a translated vertex shader must
  // link against BOTH translated fragments and the FF fragment cascade (the
  // shipped tree path is Trees.vso + FF pixel stages), and the FF fragment
  // statically reads vClipPosition/vFogDepth/vFogRangeDistance.
  lines.push("out vec4 vColor;");
  lines.push("out vec4 vSpecularColor;");
  lines.push("flat out vec4 vFlatColor;");
  for (let stage = 0; stage < 4; stage += 1) {
    lines.push(`out vec2 vTexCoord${stage};`);
  }
  lines.push("out vec4 vClipPosition;");
  lines.push("out float vFogDepth;");
  lines.push("out float vFogRangeDistance;");
  if (ctx.writesFog) {
    lines.push("out float vVsFog;");
  }
  lines.push("vec4 d3dSM1Lit(vec4 src) {");
  lines.push("  float power = clamp(src.w, -127.9961, 127.9961);");
  lines.push("  float specular = src.x > 0.0 ? pow(max(src.y, 0.0), power) : 0.0;");
  lines.push("  return vec4(1.0, max(src.x, 0.0), specular, 1.0);");
  lines.push("}");
  lines.push("void main() {");
  for (const entry of vsShader.decl) {
    const type = D3D8_SM1_DECL_TYPES[entry.type];
    lines.push(`  vec4 vsV${entry.register} = aVs${entry.register}${type && type.bgra ? ".bgra" : ""};`);
  }
  for (const reg of Array.from(ctx.usedInputs).sort()) {
    if (!declByRegister.has(reg)) {
      lines.push(`  vec4 vsV${reg} = vec4(0.0, 0.0, 0.0, 1.0);`);
    }
  }
  for (const reg of Array.from(ctx.usedTemps).sort()) {
    lines.push(`  vec4 vsR${reg} = vec4(0.0);`);
  }
  if (ctx.usesAddress) {
    lines.push("  int vsA0 = 0;");
  }
  lines.push("  vec4 vsOPos = vec4(0.0);");
  lines.push("  vec4 vsOPts = vec4(0.0);");
  lines.push("  vec4 vsOFog = vec4(1.0);");
  lines.push("  vec4 vsOD0 = vec4(1.0);");
  lines.push("  vec4 vsOD1 = vec4(0.0);");
  for (const reg of Array.from(ctx.usedTexOutputs).sort()) {
    lines.push(`  vec4 vsOT${reg} = vec4(0.0);`);
  }
  for (const line of body) {
    lines.push(`  ${line}`);
  }
  // D3D clip space -> GL clip space (z in [0,w] -> [-w,w]), matching the
  // fixed-function vertex stage, including the shim depth-bias convention.
  lines.push("  vec4 finalOPos = uUseXrClipTransform ? uXrClipTransform * vsOPos : vsOPos;");
  lines.push("  gl_Position = vec4(finalOPos.x, finalOPos.y, finalOPos.z * 2.0 - finalOPos.w, finalOPos.w);");
  lines.push("  gl_Position.z -= uDepthBias * gl_Position.w;");
  lines.push("  vColor = clamp(vsOD0, 0.0, 1.0);");
  lines.push("  vFlatColor = vColor;");
  lines.push("  vSpecularColor = clamp(vsOD1, 0.0, 1.0);");
  for (let stage = 0; stage < 4; stage += 1) {
    lines.push(ctx.usedTexOutputs.has(stage)
      ? `  vTexCoord${stage} = vsOT${stage}.xy;`
      : `  vTexCoord${stage} = vec2(0.0);`);
  }
  // Zeroed FF-interface varyings: user clip planes evaluate to dot(plane, 0)
  // == 0 (no discard) and linear fog to amount 0 (matching D3D8, where a
  // vertex shader that does not write oFog produces unfogged output).
  lines.push("  vClipPosition = vec4(0.0);");
  lines.push("  vFogDepth = 0.0;");
  lines.push("  vFogRangeDistance = 0.0;");
  if (ctx.writesFog) {
    lines.push("  vVsFog = vsOFog.x;");
  }
  lines.push("}");
  return { source: lines.join("\n"), writesFog: ctx.writesFog };
}

// Registration entry point for the wasm shim (Module.cncPortD3D8ShaderCreate).
function registerD3D8SM1Shader(spec) {
  try {
    const ir = parseD3D8SM1Tokens(spec.tokens);
    if (!ir || ir.isPixel !== Boolean(spec.isPixel)) {
      return false;
    }
    if (ir.isPixel) {
      const shader = { handle: spec.handle, ir, relativeConstantReads: [] };
      // Validate translation eagerly: build (and discard) the FF-vertex-pair
      // fragment source so unsupported constructs fail at create time.
      d3d8SM1BuildFragmentSource(shader, { translatedVs: false, vsWritesFog: false });
      d3d8SM1PixelShaders.set(spec.handle, shader);
      d3d8SM1MostRecentPixelHandle = spec.handle;
      if (d3d8PerfCountersEnabled) d3d8PerfStats.sm1PixelShadersRegistered += 1;
      // Warm the likely pairings so first use never compiles mid-frame: the
      // FF-vertex pair (terrain/roads/water/BW filter) and, when a vertex
      // shader was just created (Trees.vso -> Trees.pso), the translated-vs
      // pair. The reverse order (wave.pso -> wave.vso) is warmed at vertex
      // registration below.
      if (gl) {
        ensureD3D8ShaderPairProgram(0, spec.handle);
        if (d3d8SM1MostRecentVertexHandle !== 0) {
          ensureD3D8ShaderPairProgram(d3d8SM1MostRecentVertexHandle, spec.handle);
        }
      }
      return true;
    }
    const decl = [];
    if (spec.declTriples) {
      for (let index = 0; index + 2 < spec.declTriples.length; index += 3) {
        decl.push({
          register: spec.declTriples[index] >>> 0,
          type: spec.declTriples[index + 1] >>> 0,
          offset: spec.declTriples[index + 2] >>> 0,
        });
      }
    }
    if (decl.length === 0) {
      return false;
    }
    for (const entry of decl) {
      if (!D3D8_SM1_DECL_TYPES[entry.type]) {
        console.warn(`D3D8 SM1: unsupported vertex declaration type ${entry.type}`);
        return false;
      }
    }
    const shader = { handle: spec.handle, ir, decl };
    shader.relativeConstantReads = d3d8SM1RelativeConstantReads(shader);
    d3d8SM1BuildVertexSource(shader); // eager validation
    d3d8SM1VertexShaders.set(spec.handle, shader);
    d3d8SM1MostRecentVertexHandle = spec.handle;
    if (d3d8PerfCountersEnabled) d3d8PerfStats.sm1VertexShadersRegistered += 1;
    // Warm the translated-vs + FF-pixel pair (the shipped tree path draws
    // with the vertex shader alone — its SetPixelShader call is #if 0'd out)
    // and the just-created-pixel pair (W3DWater creates wave.pso BEFORE
    // wave.vso, so the ps-side warm-up above can't see this vs yet).
    if (gl) {
      ensureD3D8ShaderPairProgram(spec.handle, 0);
      if (d3d8SM1MostRecentPixelHandle !== 0) {
        ensureD3D8ShaderPairProgram(spec.handle, d3d8SM1MostRecentPixelHandle);
      }
    }
    return true;
  } catch (error) {
    console.warn(`D3D8 SM1: shader registration failed: ${error?.message ?? error}`);
    return false;
  }
}

function deleteD3D8SM1Shader(isPixel, handle) {
  if (isPixel) {
    d3d8SM1PixelShaders.delete(handle);
    if (d3d8SM1MostRecentPixelHandle === handle) {
      d3d8SM1MostRecentPixelHandle = 0;
    }
  } else {
    d3d8SM1VertexShaders.delete(handle);
    if (d3d8SM1MostRecentVertexHandle === handle) {
      d3d8SM1MostRecentVertexHandle = 0;
    }
  }
  for (const [key, entry] of Array.from(d3d8SM1PairPrograms)) {
    if ((isPixel && entry.psHandle === handle) || (!isPixel && entry.vsHandle === handle)) {
      if (entry.program && gl) {
        gl.deleteProgram(entry.program.program);
      }
      d3d8SM1PairPrograms.delete(key);
    }
  }
}

// Linked program for a (vertexShader, pixelShader) pair. Handle 0 on either
// side selects the corresponding fixed-function stage: FF vertex + translated
// pixel (terrain/roads/water/BW filter) or translated vertex + FF pixel
// cascade (the shipped tree path — Trees.vso with the tree pixel shader
// #if 0'd out). Returns null when the pair cannot be built (the caller falls
// back to the fixed-function program and counts it).
function ensureD3D8ShaderPairProgram(
  vsHandle,
  psHandle,
  ffVertexVariant = null,
  fixedFunctionStateVariant = null,
) {
  if (!gl || (psHandle === 0 && vsHandle === 0)) {
    return null;
  }
  const normalizedFFVertexVariant = vsHandle === 0 && ffVertexVariant === "unlit-tex2"
    ? "unlit-tex2"
    : "generic";
  const normalizedFixedFunctionStateVariant = vsHandle === 0 &&
      fixedFunctionStateVariant === "static"
    ? "static"
    : "dynamic";
  const key = `${vsHandle}|${psHandle}|${normalizedFFVertexVariant}|` +
    normalizedFixedFunctionStateVariant;
  const cached = d3d8SM1PairPrograms.get(key);
  if (cached !== undefined) {
    return cached.program;
  }
  let entry = {
    vsHandle,
    psHandle,
    ffVertexVariant: normalizedFFVertexVariant,
    fixedFunctionStateVariant: normalizedFixedFunctionStateVariant,
    program: null,
  };
  d3d8SM1PairPrograms.set(key, entry);
  const psShader = psHandle !== 0 ? d3d8SM1PixelShaders.get(psHandle) : null;
  if (psHandle !== 0 && !psShader) {
    return null;
  }
  let vsSource = null;
  let vsShader = null;
  if (vsHandle === 0) {
    if (normalizedFFVertexVariant === "unlit-tex2") {
      vsSource = d3d8UnlitTex2VertexSource();
    } else {
      ensureD3D8DrawProgram();
      vsSource = d3d8FFVertexSourceCache;
    }
  } else {
    vsShader = d3d8SM1VertexShaders.get(vsHandle);
    if (!vsShader) {
      return null;
    }
  }
  try {
    let vsBuild = null;
    if (vsShader) {
      vsBuild = d3d8SM1BuildVertexSource(vsShader);
      vsSource = vsBuild.source;
    }
    let fsBuild;
    if (psShader) {
      fsBuild = d3d8SM1BuildFragmentSource(psShader, {
        translatedVs: Boolean(vsShader),
        vsWritesFog: Boolean(vsBuild?.writesFog),
        staticFixedFunctionState: normalizedFixedFunctionStateVariant === "static",
      });
    } else {
      // Translated vertex + fixed-function pixel cascade: reuse the FF
      // fragment verbatim (uniform-driven texture stages, alpha test, fog).
      ensureD3D8DrawProgram();
      fsBuild = { source: d3d8FFFragmentSourceCache, sampledStages: null, usesBumpEnv: false };
    }
    const vertexShader = compileShader(gl.VERTEX_SHADER, vsSource);
    const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fsBuild.source);
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`link failed: ${info}`);
    }
    const bridgeProgram = buildD3D8DrawProgramLocations(program);
    bridgeProgram.psConst = gl.getUniformLocation(program, "uPsConst[0]");
    bridgeProgram.bumpEnv = gl.getUniformLocation(program, "uBumpEnv[0]");
    bridgeProgram.bumpEnvL = gl.getUniformLocation(program, "uBumpEnvL[0]");
    bridgeProgram.vsConst = gl.getUniformLocation(program, "uVsConst[0]");
    bridgeProgram.useXrClipTransform = gl.getUniformLocation(program, "uUseXrClipTransform");
    bridgeProgram.xrClipTransform = gl.getUniformLocation(program, "uXrClipTransform");
    bridgeProgram.sm1Pair = true;
    bridgeProgram.sm1PsHandle = psHandle;
    bridgeProgram.sm1VsHandle = vsHandle;
    bridgeProgram.unlitTex2 = normalizedFFVertexVariant === "unlit-tex2";
    bridgeProgram.staticSM1 = normalizedFixedFunctionStateVariant === "static";
    bridgeProgram.sm1SampledStages = fsBuild.sampledStages;
    if (vsShader) {
      bridgeProgram.declLayout = vsShader.decl.map((declEntry) => ({
        ...declEntry,
        location: gl.getAttribLocation(program, `aVs${declEntry.register}`),
      }));
    }
    entry.program = bridgeProgram;
    if (d3d8PerfCountersEnabled) d3d8PerfStats.sm1PairProgramsLinked += 1;
    return bridgeProgram;
  } catch (error) {
    console.warn(`D3D8 SM1: pair program (vs=${vsHandle}, ps=${psHandle}, ff=${normalizedFFVertexVariant}) failed: ${error?.message ?? error}`);
    if (d3d8PerfCountersEnabled) d3d8PerfStats.sm1PairProgramFailures += 1;
    return null;
  }
}

// Vertex attribute setup for translated-vs draws: bind by the shader's
// D3DVSD declaration instead of the FVF layout. Bypasses the FVF VAO cache
// (these draws are few per frame); resets the FF attrib caches so the next
// fixed-function draw rebinds cleanly.
function configureD3D8SM1DeclAttributes(bridgeProgram, vertexResource, vertexByteOffset, vertexStride) {
  bindD3D8DefaultVertexArray();
  bindD3D8ArrayBuffer(vertexResource.buffer);
  for (const entry of bridgeProgram.declLayout) {
    if (entry.location < 0) {
      continue;
    }
    const type = D3D8_SM1_DECL_TYPES[entry.type];
    gl.enableVertexAttribArray(entry.location);
    gl.vertexAttribPointer(
      entry.location,
      type.size,
      gl[type.glType],
      type.normalized,
      vertexStride,
      vertexByteOffset + entry.offset,
    );
  }
  d3d8LastVertexAttribKey = null;
  d3d8LastDefaultVertexAttribKey = null;
}

// Skips a constant-file upload when the program already holds these values.
function d3d8SM1ConstantsChanged(location, values) {
  const last = location.__cncSM1Last;
  if (last && last.length === values.length) {
    let index = 0;
    for (; index < values.length; index += 1) {
      if (last[index] !== values[index]) {
        break;
      }
    }
    if (index === values.length) {
      if (d3d8PerfCountersEnabled) d3d8PerfStats.uniformGlSkipped += 1;
      return false;
    }
    last.set(values);
    return true;
  }
  location.__cncSM1Last = new Float32Array(values);
  return true;
}

function d3d8SM1RelativeConstantReads(shader) {
  if (!shader?.ir?.instructions) {
    return [];
  }
  const reads = [];
  for (const instruction of shader.ir.instructions) {
    for (const source of instruction.srcs ?? []) {
      if (source.regType === 2 && source.relative) {
        reads.push(source.regNum);
      }
    }
  }
  return reads;
}

function d3d8SM1ConstantSliceChanged(previous, current) {
  if (!(previous instanceof Float32Array) || previous.length !== current.length) {
    return true;
  }
  for (let index = 0; index < current.length; index += 1) {
    if (!Object.is(previous[index], current[index])) {
      return true;
    }
  }
  return false;
}

function noteD3D8SM1Draw(bridgeProgram, payload) {
  if (!d3d8SM1DrawAuditEnabled) {
    return;
  }
  const pairKey = `${bridgeProgram.sm1VsHandle}|${bridgeProgram.sm1PsHandle}`;
  const pairAudit = d3d8SM1DrawAudit.get(pairKey) ?? {
    vsHandle: bridgeProgram.sm1VsHandle,
    psHandle: bridgeProgram.sm1PsHandle,
    draws: 0,
    vertexConstantStateChanges: 0,
    firstVertexConstants: null,
    lastVertexConstants: null,
  };
  pairAudit.draws += 1;

  const vertexShader = d3d8SM1VertexShaders.get(bridgeProgram.sm1VsHandle);
  const relativeReads = vertexShader?.relativeConstantReads ?? [];
  if (relativeReads.length > 0 && payload.vsConstants instanceof Float32Array) {
    const firstRegister = Math.min(...relativeReads);
    const start = firstRegister * 4;
    // Capture the base relative register and the four entries selected by the
    // shipped Trees.vso address-register path (c[a0.x + 8]). Keeping this
    // generic still makes a modded relative-address shader observable.
    const end = Math.min(payload.vsConstants.length, start + 5 * 4);
    const current = payload.vsConstants.slice(start, end);
    if (d3d8SM1ConstantSliceChanged(pairAudit.lastVertexConstants, current)) {
      pairAudit.vertexConstantStateChanges += 1;
      pairAudit.lastVertexConstants = current;
      if (pairAudit.firstVertexConstants === null) {
        pairAudit.firstVertexConstants = current.slice();
      }
    }
  }
  d3d8SM1DrawAudit.set(pairKey, pairAudit);
}

function setD3D8SM1ShaderAuditEnabled(enabled) {
  const nextEnabled = enabled === true;
  if (nextEnabled && !d3d8SM1DrawAuditEnabled) {
    d3d8SM1AuditPreviousDebugCapture = globalThis.__cncSM1DebugCapture;
    globalThis.__cncSM1DebugCapture = true;
  } else if (!nextEnabled && d3d8SM1DrawAuditEnabled) {
    if (d3d8SM1AuditPreviousDebugCapture === undefined) {
      delete globalThis.__cncSM1DebugCapture;
    } else {
      globalThis.__cncSM1DebugCapture = d3d8SM1AuditPreviousDebugCapture;
    }
    d3d8SM1AuditPreviousDebugCapture = undefined;
  }
  d3d8SM1DrawAuditEnabled = nextEnabled;
  d3d8SM1DrawAudit.clear();
  return d3d8SM1DrawAuditEnabled;
}

function d3d8SM1ShaderAuditSummary() {
  const describeShader = (shader, isPixel) => ({
    handle: shader.handle,
    type: isPixel ? "pixel" : "vertex",
    model: `${isPixel ? "ps" : "vs"}.${shader.ir.major}.${shader.ir.minor}`,
    instructions: shader.ir.instructions.map((instruction) => instruction.name),
    relativeConstantReads: shader.relativeConstantReads,
    declaration: isPixel ? [] : shader.decl.map((entry) => ({ ...entry })),
  });
  return {
    pixelShaders: Array.from(d3d8SM1PixelShaders.values(), (shader) =>
      describeShader(shader, true)),
    vertexShaders: Array.from(d3d8SM1VertexShaders.values(), (shader) =>
      describeShader(shader, false)),
    pairs: Array.from(d3d8SM1DrawAudit.values(), (audit) => ({
      vsHandle: audit.vsHandle,
      psHandle: audit.psHandle,
      draws: audit.draws,
      vertexConstantStateChanges: audit.vertexConstantStateChanges,
      firstVertexConstants: audit.firstVertexConstants
        ? Array.from(audit.firstVertexConstants) : null,
      lastVertexConstants: audit.lastVertexConstants
        ? Array.from(audit.lastVertexConstants) : null,
    })),
    linkedPairs: Array.from(d3d8SM1PairPrograms.values(), (entry) => ({
      vsHandle: entry.vsHandle,
      psHandle: entry.psHandle,
      linked: Boolean(entry.program),
    })),
  };
}

// Uploads SM1 constant files + bump-env matrices for a shader-pair draw.
function uploadD3D8SM1DrawUniforms(bridgeProgram, payload, renderState) {
  if (bridgeProgram.psConst && payload.psConstants &&
      d3d8SM1ConstantsChanged(bridgeProgram.psConst, payload.psConstants)) {
    gl.uniform4fv(bridgeProgram.psConst, payload.psConstants);
    if (d3d8PerfCountersEnabled) d3d8PerfStats.uniformGlCalls += 1;
  }
  if (bridgeProgram.vsConst && payload.vsConstants &&
      d3d8SM1ConstantsChanged(bridgeProgram.vsConst, payload.vsConstants)) {
    gl.uniform4fv(bridgeProgram.vsConst, payload.vsConstants);
    if (d3d8PerfCountersEnabled) d3d8PerfStats.uniformGlCalls += 1;
  }
  if (bridgeProgram.bumpEnv) {
    const bump = d3d8SM1BumpEnvScratch;
    for (let stage = 0; stage < 4; stage += 1) {
      const stageState = renderState.textureStages[stage];
      bump[stage * 4] = d3dDwordToFloat(stageState.bumpEnvMat00);
      bump[stage * 4 + 1] = d3dDwordToFloat(stageState.bumpEnvMat01);
      bump[stage * 4 + 2] = d3dDwordToFloat(stageState.bumpEnvMat10);
      bump[stage * 4 + 3] = d3dDwordToFloat(stageState.bumpEnvMat11);
    }
    gl.uniform4fv(bridgeProgram.bumpEnv, bump);
    if (d3d8PerfCountersEnabled) d3d8PerfStats.uniformGlCalls += 1;
  }
  if (bridgeProgram.bumpEnvL) {
    const bumpL = d3d8SM1BumpEnvLScratch;
    for (let stage = 0; stage < 4; stage += 1) {
      const stageState = renderState.textureStages[stage];
      bumpL[stage * 2] = d3dDwordToFloat(stageState.bumpEnvLScale);
      bumpL[stage * 2 + 1] = d3dDwordToFloat(stageState.bumpEnvLOffset);
    }
    gl.uniform2fv(bridgeProgram.bumpEnvL, bumpL);
    if (d3d8PerfCountersEnabled) d3d8PerfStats.uniformGlCalls += 1;
  }
}

const d3d8SM1BumpEnvScratch = new Float32Array(16);
const d3d8SM1BumpEnvLScratch = new Float32Array(8);

// Shader tier the wasm shim samples once at device create
// (Module.cncPortD3D8ShaderTier): 1 = advertise ps.1.1/vs.1.1 (programmable
// paths), 0 = historical fixed-function-only adapter.
function d3d8ShaderTierQuery() {
  const record = (tier, source) => {
    globalThis.__cncD3D8ShaderTierLast = { tier, source };
    harnessState.graphics.d3d8ShaderTier = tier === 1 ? "ps11" : "ff";
    return tier;
  };
  let storedTier = null;
  try {
    storedTier = typeof localStorage !== "undefined"
      ? localStorage.getItem("cncPortShaderTier")
      : null;
  } catch {
    // Storage is optional; URL and default selection still apply.
  }
  const resolved = resolveShaderTier({
    forcedTier: globalThis.__cncD3D8ShaderTier,
    search: typeof location !== "undefined" ? location.search : "",
    storedTier,
  });
  return record(resolved.tier === "ps11" ? 1 : 0, resolved.source);
}

function ensureD3D8DepthStencilProgram() {
  if (!gl) {
    return null;
  }
  if (d3d8DepthStencilProgram) {
    return d3d8DepthStencilProgram;
  }

  const vertexShader = compileShader(gl.VERTEX_SHADER, `#version 300 es
    in vec4 aPosition;
    uniform float uScale;
    uniform bool uUseTransforms;
    uniform bool uPretransformedPosition;
    uniform vec4 uD3DViewport;
    uniform mat4 uWorld;
    uniform mat4 uView;
    uniform mat4 uProjection;
    uniform float uDepthBias;
    out vec4 vClipPosition;
    vec4 d3dPretransformedPositionToClip(vec4 screenPosition) {
      vec2 viewportOrigin = uD3DViewport.xy;
      vec2 viewportSize = max(uD3DViewport.zw, vec2(1.0));
      vec2 webGlPosition = screenPosition.xy + vec2(0.5);
      vec3 ndc = vec3(
        ((webGlPosition.x - viewportOrigin.x) / viewportSize.x) * 2.0 - 1.0,
        1.0 - ((webGlPosition.y - viewportOrigin.y) / viewportSize.y) * 2.0,
        screenPosition.z * 2.0 - 1.0
      );
      float rhw = abs(screenPosition.w) > 0.000001 ? screenPosition.w : 1.0;
      float clipW = 1.0 / rhw;
      return vec4(ndc * clipW, clipW);
    }
    void main() {
      vec4 worldPosition = vec4(aPosition.xyz, 1.0);
      if (uPretransformedPosition) {
        gl_Position = d3dPretransformedPositionToClip(aPosition);
      } else if (uUseTransforms) {
        worldPosition = uWorld * vec4(aPosition.xyz, 1.0);
        vec4 viewPosition = uView * worldPosition;
        vec4 d3dClip = uProjection * viewPosition;
        gl_Position = vec4(d3dClip.x, d3dClip.y, d3dClip.z * 2.0 - d3dClip.w, d3dClip.w);
      } else {
        gl_Position = vec4(aPosition.x / uScale, aPosition.y / uScale, 0.0, 1.0);
      }
      gl_Position.z -= uDepthBias * gl_Position.w;
      gl_PointSize = 1.0;
      vClipPosition = worldPosition;
    }
  `);
  const fragmentShader = compileShader(gl.FRAGMENT_SHADER, `#version 300 es
    precision highp float;
    in vec4 vClipPosition;
    uniform int uClipPlaneMask;
    uniform vec4 uClipPlanes[6];
    out vec4 fragColor;
    void main() {
      for (int index = 0; index < 6; ++index) {
        if ((uClipPlaneMask & (1 << index)) != 0 && dot(uClipPlanes[index], vClipPosition) < 0.0) {
          discard;
        }
      }
      fragColor = vec4(1.0);
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
    throw new Error(`D3D8 depth/stencil bridge program link failed: ${info}`);
  }

  d3d8DepthStencilProgram = {
    program,
    position: gl.getAttribLocation(program, "aPosition"),
    normal: -1,
    diffuse: -1,
    specular: -1,
    texCoord0: -1,
    texCoord1: -1,
    scale: gl.getUniformLocation(program, "uScale"),
    useTransforms: gl.getUniformLocation(program, "uUseTransforms"),
    pretransformedPosition: gl.getUniformLocation(program, "uPretransformedPosition"),
    d3dViewport: gl.getUniformLocation(program, "uD3DViewport"),
    world: gl.getUniformLocation(program, "uWorld"),
    view: gl.getUniformLocation(program, "uView"),
    projection: gl.getUniformLocation(program, "uProjection"),
    depthBias: gl.getUniformLocation(program, "uDepthBias"),
    texture0CoordinateMode: null,
    useTexture0Transform: null,
    texture0Transform: null,
    texture0TransformComponentCount: null,
    texture0TransformProjected: null,
    texture1CoordinateMode: null,
    useTexture1Transform: null,
    texture1Transform: null,
    texture1TransformComponentCount: null,
    texture1TransformProjected: null,
    texture2CoordinateMode: null,
    texture2CoordSet: null,
    useTexture2Transform: null,
    texture2Transform: null,
    texture2TransformComponentCount: null,
    texture2TransformProjected: null,
    texture3CoordinateMode: null,
    texture3CoordSet: null,
    useTexture3Transform: null,
    texture3Transform: null,
    texture3TransformComponentCount: null,
    texture3TransformProjected: null,
    pointSize: null,
    pointSizeMin: null,
    pointSizeMax: null,
    pointScaleEnable: null,
    pointScaleA: null,
    pointScaleB: null,
    pointScaleC: null,
    pointViewportHeight: null,
    lightingEnabled: null,
    specularEnabled: null,
    normalizeNormals: null,
    localViewer: null,
    colorVertexEnabled: null,
    sceneAmbient: null,
    materialDiffuse: null,
    materialAmbient: null,
    materialSpecular: null,
    materialEmissive: null,
    materialPower: null,
    diffuseMaterialSource: null,
    specularMaterialSource: null,
    ambientMaterialSource: null,
    emissiveMaterialSource: null,
    fixedLightCount: null,
    fixedLightType: null,
    fixedLightDiffuse: null,
    fixedLightSpecular: null,
    fixedLightAmbient: null,
    fixedLightPosition: null,
    fixedLightDirection: null,
    fixedLightRangeAttenuation: null,
    fixedLightSpot: null,
    useTexture0: null,
    drawingPoints: null,
    pointSpriteEnable: null,
    texture0: null,
    texture0LodBias: null,
    texture0Semantic: null,
    texture0FlipY: null,
    useTexture1: null,
    texture1: null,
    texture1LodBias: null,
    texture1Semantic: null,
    texture1FlipY: null,
    useTexture2: null,
    texture2: null,
    texture2LodBias: null,
    texture2Semantic: null,
    texture2FlipY: null,
    useTexture3: null,
    texture3: null,
    texture3LodBias: null,
    texture3Semantic: null,
    texture3FlipY: null,
    textureFactor: null,
    stage0ColorOp: null,
    stage0ColorArg0: null,
    stage0ColorArg1: null,
    stage0ColorArg2: null,
    stage0AlphaOp: null,
    stage0AlphaArg0: null,
    stage0AlphaArg1: null,
    stage0AlphaArg2: null,
    stage0ResultArg: null,
    stage1ColorOp: null,
    stage1ColorArg0: null,
    stage1ColorArg1: null,
    stage1ColorArg2: null,
    stage1AlphaOp: null,
    stage1AlphaArg0: null,
    stage1AlphaArg1: null,
    stage1AlphaArg2: null,
    stage1ResultArg: null,
    stage2ColorOp: null,
    stage2ColorArg0: null,
    stage2ColorArg1: null,
    stage2ColorArg2: null,
    stage2AlphaOp: null,
    stage2AlphaArg0: null,
    stage2AlphaArg1: null,
    stage2AlphaArg2: null,
    stage2ResultArg: null,
    stage3ColorOp: null,
    stage3ColorArg0: null,
    stage3ColorArg1: null,
    stage3ColorArg2: null,
    stage3AlphaOp: null,
    stage3AlphaArg0: null,
    stage3AlphaArg1: null,
    stage3AlphaArg2: null,
    stage3ResultArg: null,
    alphaTestEnabled: null,
    alphaFunc: null,
    alphaRef: null,
    implicitAlphaCutoutThreshold: null,
    fogEnabled: null,
    fogRangeEnabled: null,
    fogColor: null,
    fogStart: null,
    fogEnd: null,
    clipPlaneMask: gl.getUniformLocation(program, "uClipPlaneMask"),
    clipPlanes: gl.getUniformLocation(program, "uClipPlanes[0]"),
    useFlatShade: null,
  };
  return d3d8DepthStencilProgram;
}

// No-discard depth/stencil variant for draws with no active clip planes —
// which is every stencil-shadow-volume draw in practice. `discard` in a
// fragment shader (even behind a uniform branch that never takes it) disables
// early depth/stencil rejection, so the clip-plane FS above forces the GPU to
// run a fragment program for every fragment of every shadow volume. Volume
// fill covers the screen many times over in unit-heavy scenes, which is what
// crushed the campaign-intro frame rate on Apple GPUs. With no discard (and
// color writes already masked off) the hardware performs the whole stencil
// update with early fragment tests and no fragment shader work.
function ensureD3D8DepthStencilNoClipProgram() {
  if (!gl) {
    return null;
  }
  if (d3d8DepthStencilNoClipProgram) {
    return d3d8DepthStencilNoClipProgram;
  }
  const template = ensureD3D8DepthStencilProgram();
  if (!template) {
    return null;
  }
  const vertexShader = compileShader(gl.VERTEX_SHADER, `#version 300 es
    in vec4 aPosition;
    uniform float uScale;
    uniform bool uUseTransforms;
    uniform bool uPretransformedPosition;
    uniform vec4 uD3DViewport;
    uniform mat4 uWorld;
    uniform mat4 uView;
    uniform mat4 uProjection;
    uniform float uDepthBias;
    vec4 d3dPretransformedPositionToClip(vec4 screenPosition) {
      vec2 viewportOrigin = uD3DViewport.xy;
      vec2 viewportSize = max(uD3DViewport.zw, vec2(1.0));
      vec2 webGlPosition = screenPosition.xy + vec2(0.5);
      vec3 ndc = vec3(
        ((webGlPosition.x - viewportOrigin.x) / viewportSize.x) * 2.0 - 1.0,
        1.0 - ((webGlPosition.y - viewportOrigin.y) / viewportSize.y) * 2.0,
        screenPosition.z * 2.0 - 1.0
      );
      float rhw = abs(screenPosition.w) > 0.000001 ? screenPosition.w : 1.0;
      float clipW = 1.0 / rhw;
      return vec4(ndc * clipW, clipW);
    }
    void main() {
      if (uPretransformedPosition) {
        gl_Position = d3dPretransformedPositionToClip(aPosition);
      } else if (uUseTransforms) {
        vec4 worldPosition = uWorld * vec4(aPosition.xyz, 1.0);
        vec4 viewPosition = uView * worldPosition;
        vec4 d3dClip = uProjection * viewPosition;
        gl_Position = vec4(d3dClip.x, d3dClip.y, d3dClip.z * 2.0 - d3dClip.w, d3dClip.w);
      } else {
        gl_Position = vec4(aPosition.x / uScale, aPosition.y / uScale, 0.0, 1.0);
      }
      gl_Position.z -= uDepthBias * gl_Position.w;
      gl_PointSize = 1.0;
    }
  `);
  const fragmentShader = compileShader(gl.FRAGMENT_SHADER, `#version 300 es
    precision highp float;
    out vec4 fragColor;
    void main() {
      fragColor = vec4(1.0);
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
    throw new Error(`D3D8 depth/stencil no-clip bridge program link failed: ${info}`);
  }
  d3d8DepthStencilNoClipProgram = {
    ...template,
    program,
    position: gl.getAttribLocation(program, "aPosition"),
    scale: gl.getUniformLocation(program, "uScale"),
    useTransforms: gl.getUniformLocation(program, "uUseTransforms"),
    pretransformedPosition: gl.getUniformLocation(program, "uPretransformedPosition"),
    d3dViewport: gl.getUniformLocation(program, "uD3DViewport"),
    world: gl.getUniformLocation(program, "uWorld"),
    view: gl.getUniformLocation(program, "uView"),
    projection: gl.getUniformLocation(program, "uProjection"),
    depthBias: gl.getUniformLocation(program, "uDepthBias"),
    clipPlaneMask: null,
    clipPlanes: null,
  };
  return d3d8DepthStencilNoClipProgram;
}

function d3dPrimitiveToGl(primitiveType) {
  if (!gl) {
    return null;
  }
  switch (Number(primitiveType)) {
    case D3DPT_POINTLIST:
      return gl.POINTS;
    case D3DPT_LINELIST:
      return gl.LINES;
    case D3DPT_LINESTRIP:
      return gl.LINE_STRIP;
    case D3DPT_TRIANGLELIST:
      return gl.TRIANGLES;
    case D3DPT_TRIANGLESTRIP:
      return gl.TRIANGLE_STRIP;
    case D3DPT_TRIANGLEFAN:
      return gl.TRIANGLE_FAN;
    default:
      return null;
  }
}

function d3d8GlPrimitiveSupported(primitive) {
  return gl && (
    primitive === gl.POINTS ||
    primitive === gl.LINES ||
    primitive === gl.LINE_STRIP ||
    primitive === gl.TRIANGLES ||
    primitive === gl.TRIANGLE_STRIP ||
    primitive === gl.TRIANGLE_FAN
  );
}

function glPrimitiveName(primitive) {
  if (!gl) {
    return "unknown";
  }
  switch (primitive) {
    case gl.POINTS:
      return "points";
    case gl.LINES:
      return "lines";
    case gl.LINE_STRIP:
      return "lineStrip";
    case gl.TRIANGLES:
      return "triangles";
    case gl.TRIANGLE_STRIP:
      return "triangleStrip";
    case gl.TRIANGLE_FAN:
      return "triangleFan";
    default:
      return "unknown";
  }
}

function d3dFillModeName(fillMode) {
  switch (Number(fillMode) >>> 0) {
    case D3DFILL_POINT:
      return "point";
    case D3DFILL_WIREFRAME:
      return "wireframe";
    case D3DFILL_SOLID:
      return "solid";
    default:
      return "unknown";
  }
}

function d3dShadeModeName(shadeMode) {
  switch (Number(shadeMode) >>> 0) {
    case D3DSHADE_FLAT:
      return "flat";
    case D3DSHADE_GOURAUD:
      return "gouraud";
    case D3DSHADE_PHONG:
      return "phong";
    default:
      return "unknown";
  }
}

function d3dMaterialSourceName(source) {
  switch (Number(source) >>> 0) {
    case D3DMCS_MATERIAL:
      return "material";
    case D3DMCS_COLOR1:
      return "color1";
    case D3DMCS_COLOR2:
      return "color2";
    default:
      return "unknown";
  }
}

function d3d8DepthBiasInfo(zBias) {
  const raw = Number(zBias ?? 0) >>> 0;
  const clamped = Math.max(0, Math.min(16, raw));
  // Shader applies gl_Position.z -= ndc * w (constant NDC bias of -ndc) => [0,1] depth bias = -ndc/2.
  // D3D8 24/32-bit target uses -ZBias/((1<<20)-1) (d3d8to9 CalcDepthBias). So ndc = 2*clamped/((1<<20)-1).
  const D3D8_DEPTH_BIAS_DENOM = (1 << 20) - 1;
  // The constant-NDC shift above is uniform across a primitive and does NOT scale
  // with the polygon's window-space depth slope, so it cannot reliably win the
  // depth test for large coplanar meshes (e.g. the terrain-tessellated projected
  // insignia/shadow decals, which span many terrain cells over a big depth range).
  // On such meshes ZBIAS=1 only shifted depth ~1e-6, well below the depth-buffer
  // quantisation at gameplay camera distances, so half the decal triangles lost
  // the z-fight against the plaza and the decal rendered clipped along the terrain
  // cell diagonals and flickered. D3D8's D3DRS_ZBIAS was, on real hardware, a
  // polygon-offset-style bias; emulate that here with gl.polygonOffset (slope
  // scaled) which robustly biases coplanar geometry toward the camera regardless
  // of depth encoding. Negative factor/units pull the primitive nearer (smaller
  // depth), matching a positive D3D8 ZBIAS. Factor gives the slope-scaled term
  // that defeats z-fighting across the whole mesh; units adds a small constant
  // floor so flat, camera-facing decals still bias.
  const polygonOffset = clamped > 0
    ? { enabled: true, factor: -clamped, units: -2 * clamped }
    : { enabled: false, factor: 0, units: 0 };
  return { raw, clamped, ndc: (2.0 * clamped) / D3D8_DEPTH_BIAS_DENOM, polygonOffset };
}

function d3d8PointSpriteInfo(renderState, primitiveType, viewport) {
  const pointSize = Math.max(0, d3dDwordToFloat(renderState.pointSize));
  const pointSizeMin = Math.max(0, d3dDwordToFloat(renderState.pointSizeMin));
  const pointSizeMax = Math.max(pointSizeMin, d3dDwordToFloat(renderState.pointSizeMax));
  const scaleA = Math.max(0, d3dDwordToFloat(renderState.pointScaleA));
  const scaleB = Math.max(0, d3dDwordToFloat(renderState.pointScaleB));
  const scaleC = Math.max(0, d3dDwordToFloat(renderState.pointScaleC));
  const viewportHeight = Math.max(
    1,
    Number(viewport?.gl?.height ?? viewport?.d3d?.height ?? viewport?.requested?.height ?? 1),
  );
  return {
    drawingPoints: (Number(primitiveType ?? 0) >>> 0) === D3DPT_POINTLIST,
    spriteEnable: Number(renderState.pointSpriteEnable ?? 0) !== 0,
    scaleEnable: Number(renderState.pointScaleEnable ?? 0) !== 0,
    pointSize,
    pointSizeMin,
    pointSizeMax,
    scaleA,
    scaleB,
    scaleC,
    viewportHeight,
  };
}

function d3d8PointSpriteUniformsEqual(left, right) {
  return Boolean(
    left && right &&
    left.drawingPoints === right.drawingPoints &&
    left.spriteEnable === right.spriteEnable &&
    left.scaleEnable === right.scaleEnable &&
    left.pointSize === right.pointSize &&
    left.pointSizeMin === right.pointSizeMin &&
    left.pointSizeMax === right.pointSizeMax &&
    left.scaleA === right.scaleA &&
    left.scaleB === right.scaleB &&
    left.scaleC === right.scaleC &&
    left.viewportHeight === right.viewportHeight
  );
}

function d3dPrimitiveIsTriangle(primitiveType) {
  const type = Number(primitiveType) >>> 0;
  return type === D3DPT_TRIANGLELIST || type === D3DPT_TRIANGLESTRIP || type === D3DPT_TRIANGLEFAN;
}

function d3d8CanUseDepthStencilOnlyProgramBase(renderState, primitiveType) {
  const colorWrites = Number(renderState?.colorWriteEnable ?? (
    D3DCOLORWRITEENABLE_RED |
    D3DCOLORWRITEENABLE_GREEN |
    D3DCOLORWRITEENABLE_BLUE |
    D3DCOLORWRITEENABLE_ALPHA
  )) >>> 0;
  return (colorWrites & (
    D3DCOLORWRITEENABLE_RED |
    D3DCOLORWRITEENABLE_GREEN |
    D3DCOLORWRITEENABLE_BLUE |
    D3DCOLORWRITEENABLE_ALPHA
  )) === 0 &&
    Number(renderState?.alphaTestEnable ?? 0) === 0 &&
    Number(renderState?.fillMode ?? D3DFILL_SOLID) === D3DFILL_SOLID &&
    d3dPrimitiveIsTriangle(primitiveType);
}

function d3d8ImplicitAlphaCutoutCannotApply(renderState) {
  return Boolean(
    renderState &&
    (renderState.alphaBlendEnable !== 0 ||
      renderState.zEnable === D3DZB_FALSE ||
      renderState.zWriteEnable === 0)
  );
}

function d3d8CanUseDepthStencilOnlyProgramWithoutTextureProbe(renderState, primitiveType) {
  return d3d8CanUseDepthStencilOnlyProgramBase(renderState, primitiveType) &&
    d3d8ImplicitAlphaCutoutCannotApply(renderState);
}

function d3d8CanUseDepthStencilOnlyProgram(renderState, primitiveType, implicitAlphaCutoutThreshold) {
  return d3d8CanUseDepthStencilOnlyProgramBase(renderState, primitiveType) &&
    implicitAlphaCutoutThreshold < 0;
}

function readD3D8Index(indexBytes, byteOffset, index, indexSize) {
  const absolute = byteOffset + index * indexSize;
  if (!(indexBytes instanceof Uint8Array) || absolute + indexSize > indexBytes.byteLength) {
    return null;
  }
  if (indexSize === 2) {
    return indexBytes[absolute] | (indexBytes[absolute + 1] << 8);
  }
  if (indexSize === 4) {
    return (indexBytes[absolute] |
      (indexBytes[absolute + 1] << 8) |
      (indexBytes[absolute + 2] << 16) |
      (indexBytes[absolute + 3] << 24)) >>> 0;
  }
  return null;
}

function projectD3D8VertexToNdc(vertexBytes, vertexByteOffset, vertexStride, transforms, vertexIndex) {
  if (!(vertexBytes instanceof Uint8Array) || !transforms || vertexStride < 12 || vertexIndex === null) {
    return null;
  }
  const base = vertexByteOffset + vertexIndex * vertexStride;
  if (base < 0 || base + 12 > vertexBytes.byteLength) {
    return null;
  }
  const view = new DataView(vertexBytes.buffer, vertexBytes.byteOffset, vertexBytes.byteLength);
  const position = [
    readD3D8Float32(view, base),
    readD3D8Float32(view, base + 4),
    readD3D8Float32(view, base + 8),
  ];
  const worldPosition = multiplyD3D8ColumnMatrixVector(transforms.world, [...position, 1]);
  const viewPosition = multiplyD3D8ColumnMatrixVector(transforms.view, worldPosition);
  const d3dClip = multiplyD3D8ColumnMatrixVector(transforms.projection, viewPosition);
  const glClip = [d3dClip[0], d3dClip[1], d3dClip[2] * 2.0 - d3dClip[3], d3dClip[3]];
  if (Math.abs(glClip[3]) <= 0.000001) {
    return null;
  }
  return [
    glClip[0] / glClip[3],
    glClip[1] / glClip[3],
    glClip[2] / glClip[3],
  ];
}

function projectD3D8PretransformedVertex(vertexBytes, vertexByteOffset, vertexStride, viewport, vertexIndex) {
  if (!(vertexBytes instanceof Uint8Array) || vertexStride < 16 || vertexIndex === null) {
    return null;
  }
  const base = vertexByteOffset + vertexIndex * vertexStride;
  if (base < 0 || base + 16 > vertexBytes.byteLength) {
    return null;
  }
  const d3dViewport = viewport?.d3d ?? {};
  const viewportX = finiteNumber(d3dViewport.x, 0);
  const viewportY = finiteNumber(d3dViewport.y, 0);
  const viewportWidth = Math.max(1, finiteNumber(d3dViewport.width, 1));
  const viewportHeight = Math.max(1, finiteNumber(d3dViewport.height, 1));
  const view = new DataView(vertexBytes.buffer, vertexBytes.byteOffset, vertexBytes.byteLength);
  const x = readD3D8Float32(view, base);
  const y = readD3D8Float32(view, base + 4);
  const z = readD3D8Float32(view, base + 8);
  const rhw = readD3D8Float32(view, base + 12);
  const clipW = Math.abs(rhw) > 0.000001 ? 1.0 / rhw : 1.0;
  return {
    ndc: [
      ((x - viewportX) / viewportWidth) * 2.0 - 1.0,
      1.0 - ((y - viewportY) / viewportHeight) * 2.0,
      z * 2.0 - 1.0,
    ],
    clipW,
  };
}

function d3d8ProjectedTriangleArea(a, b, c) {
  if (!a || !b || !c) {
    return null;
  }
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function d3d8TriangleCullInfo(area, cullMode) {
  if (!Number.isFinite(area)) {
    return { winding: "unknown", culled: false, degenerate: false };
  }
  if (Math.abs(area) <= 0.0000001) {
    return { winding: "degenerate", culled: false, degenerate: true };
  }
  const winding = area < 0 ? "cw" : "ccw";
  return {
    winding,
    culled: (cullMode === D3DCULL_CW && winding === "cw") ||
      (cullMode === D3DCULL_CCW && winding === "ccw"),
    degenerate: false,
  };
}

function buildD3D8FlatShadeIndices(indexResource, indexByteOffset, indexCount, indexSize, primitiveType) {
  const indexBytes = indexResource?.bytes;
  const requiredByteSize = indexByteOffset + indexCount * indexSize;
  if (!(indexBytes instanceof Uint8Array)) {
    return { supported: false, reason: "missingIndexMirror" };
  }
  if (requiredByteSize > indexBytes.byteLength) {
    return { supported: false, reason: "indexRangeOutOfBounds" };
  }

  const triangles = [];
  let sourceTriangleCount = 0;
  const addTriangle = (a, b, c, first) => {
    if (a === null || b === null || c === null || a === b || b === c || c === a) {
      return;
    }
    if (first === a) {
      triangles.push(b, c, a);
    } else if (first === b) {
      triangles.push(c, a, b);
    } else {
      triangles.push(a, b, c);
    }
    sourceTriangleCount += 1;
  };
  const readIndex = (index) => readD3D8Index(indexBytes, indexByteOffset, index, indexSize);
  switch (Number(primitiveType) >>> 0) {
    case D3DPT_TRIANGLELIST:
      for (let index = 0; index + 2 < indexCount; index += 3) {
        const a = readIndex(index);
        const b = readIndex(index + 1);
        const c = readIndex(index + 2);
        addTriangle(a, b, c, a);
      }
      break;
    case D3DPT_TRIANGLESTRIP:
      for (let index = 0; index + 2 < indexCount; ++index) {
        const a = readIndex(index);
        const b = readIndex(index + 1);
        const c = readIndex(index + 2);
        if ((index & 1) === 0) {
          addTriangle(a, b, c, a);
        } else {
          addTriangle(b, a, c, a);
        }
      }
      break;
    case D3DPT_TRIANGLEFAN:
      for (let index = 1; index + 1 < indexCount; ++index) {
        const a = readIndex(0);
        const b = readIndex(index);
        const c = readIndex(index + 1);
        addTriangle(a, b, c, b);
      }
      break;
    default:
      return { supported: false, reason: "nonTrianglePrimitive" };
  }

  if (triangles.length === 0) {
    return { supported: false, reason: "emptyFlatShadeTriangles" };
  }
  const IndexArray = indexSize === 4 ? Uint32Array : Uint16Array;
  return {
    supported: true,
    triangleIndices: new IndexArray(triangles),
    generatedIndexCount: triangles.length,
    sourceTriangleCount,
    indexTypeName: indexSize === 4 ? "uint32" : "uint16",
  };
}

function buildD3D8WireframeIndices(
  indexResource,
  indexByteOffset,
  indexCount,
  indexSize,
  primitiveType,
  options = {},
) {
  const indexBytes = indexResource?.bytes;
  const requiredByteSize = indexByteOffset + indexCount * indexSize;
  if (!(indexBytes instanceof Uint8Array)) {
    return { supported: false, reason: "missingIndexMirror" };
  }
  if (requiredByteSize > indexBytes.byteLength) {
    return { supported: false, reason: "indexRangeOutOfBounds" };
  }

  const vertexBytes = options.vertexResource?.bytes;
  const vertexByteOffset = Number(options.vertexByteOffset ?? 0) >>> 0;
  const vertexStride = Number(options.vertexStride ?? 0) >>> 0;
  const cullMode = Number(options.cullMode ?? D3DCULL_NONE) >>> 0;
  const cullRequested = cullMode === D3DCULL_CW || cullMode === D3DCULL_CCW;
  const cullingAvailable = Boolean(cullRequested &&
    vertexBytes instanceof Uint8Array &&
    options.transforms &&
    vertexStride >= 12);
  const projectedVertex = (vertexIndex) =>
    projectD3D8VertexToNdc(vertexBytes, vertexByteOffset, vertexStride, options.transforms, vertexIndex);
  const edges = [];
  let sourceTriangleCount = 0;
  let emittedTriangleCount = 0;
  let culledTriangleCount = 0;
  let degenerateTriangleCount = 0;
  let cwTriangleCount = 0;
  let ccwTriangleCount = 0;
  const addTriangle = (a, b, c) => {
    if (a === null || b === null || c === null || a === b || b === c || c === a) {
      degenerateTriangleCount += 1;
      return;
    }
    sourceTriangleCount += 1;
    if (cullingAvailable) {
      const area = d3d8ProjectedTriangleArea(
        projectedVertex(a),
        projectedVertex(b),
        projectedVertex(c),
      );
      const cullInfo = d3d8TriangleCullInfo(area, cullMode);
      if (cullInfo.degenerate) {
        degenerateTriangleCount += 1;
        return;
      }
      if (cullInfo.winding === "cw") {
        cwTriangleCount += 1;
      } else if (cullInfo.winding === "ccw") {
        ccwTriangleCount += 1;
      }
      if (cullInfo.culled) {
        culledTriangleCount += 1;
        return;
      }
    }
    edges.push(a, b, b, c, c, a);
    emittedTriangleCount += 1;
  };
  const readIndex = (index) => readD3D8Index(indexBytes, indexByteOffset, index, indexSize);
  switch (Number(primitiveType) >>> 0) {
    case D3DPT_TRIANGLELIST:
      for (let index = 0; index + 2 < indexCount; index += 3) {
        addTriangle(readIndex(index), readIndex(index + 1), readIndex(index + 2));
      }
      break;
    case D3DPT_TRIANGLESTRIP:
      for (let index = 0; index + 2 < indexCount; ++index) {
        const a = readIndex(index);
        const b = readIndex(index + 1);
        const c = readIndex(index + 2);
        if ((index & 1) === 0) {
          addTriangle(a, b, c);
        } else {
          addTriangle(b, a, c);
        }
      }
      break;
    case D3DPT_TRIANGLEFAN:
      for (let index = 1; index + 1 < indexCount; ++index) {
        addTriangle(readIndex(0), readIndex(index), readIndex(index + 1));
      }
      break;
    default:
      return { supported: false, reason: "nonTrianglePrimitive" };
  }

  const IndexArray = indexSize === 4 ? Uint32Array : Uint16Array;
  if (edges.length === 0 && !(cullingAvailable && sourceTriangleCount > 0 && culledTriangleCount > 0)) {
    return { supported: false, reason: "emptyWireframe" };
  }
  return {
    supported: true,
    lineIndices: new IndexArray(edges),
    generatedIndexCount: edges.length,
    sourceTriangleCount,
    indexTypeName: indexSize === 4 ? "uint32" : "uint16",
    cullMode,
    cullingRequested: cullRequested,
    cullingApplied: cullingAvailable,
    emittedTriangleCount,
    culledTriangleCount,
    degenerateTriangleCount,
    cwTriangleCount,
    ccwTriangleCount,
  };
}

function createD3D8FillModeDrawInfo(
  renderState,
  primitiveType,
  indexResource,
  indexByteOffset,
  indexCount,
  indexSize,
  options = {},
) {
  const mode = Number(renderState.fillMode ?? D3DFILL_SOLID) >>> 0;
  const baseGlPrimitive = d3dPrimitiveToGl(primitiveType);
  const info = {
    mode,
    modeName: d3dFillModeName(mode),
    requestedPrimitiveType: Number(primitiveType ?? 0) >>> 0,
    originalPrimitiveName: glPrimitiveName(baseGlPrimitive),
    glPrimitive: baseGlPrimitive,
    glPrimitiveName: glPrimitiveName(baseGlPrimitive),
    drawIndexCount: indexCount,
    drawIndexByteOffset: indexByteOffset,
    generatedIndexCount: 0,
    sourceTriangleCount: 0,
    emittedTriangleCount: 0,
    culledTriangleCount: 0,
    degenerateTriangleCount: 0,
    cwTriangleCount: 0,
    ccwTriangleCount: 0,
    cullMode: Number(renderState.cullMode ?? D3DCULL_NONE) >>> 0,
    cullingRequested: false,
    cullingApplied: false,
    indexTypeName: indexSize === 4 ? "uint32" : "uint16",
    temporaryIndexBuffer: false,
    pointFill: false,
    wireframe: false,
    supported: d3d8GlPrimitiveSupported(baseGlPrimitive),
    fallbackReason: d3d8GlPrimitiveSupported(baseGlPrimitive) ? null : "unsupportedPrimitive",
  };

  if (!info.supported) {
    return info;
  }
  if (mode === D3DFILL_POINT) {
    info.pointFill = true;
    info.glPrimitive = gl.POINTS;
    info.glPrimitiveName = glPrimitiveName(info.glPrimitive);
    return info;
  }
  if (mode !== D3DFILL_WIREFRAME) {
    return info;
  }
  if (!d3dPrimitiveIsTriangle(primitiveType)) {
    return info;
  }

  const wireframe = buildD3D8WireframeIndices(
    indexResource,
    indexByteOffset,
    indexCount,
    indexSize,
    primitiveType,
    {
      ...options,
      cullMode: info.cullMode,
    },
  );
  info.wireframe = true;
  info.supported = wireframe.supported;
  info.fallbackReason = wireframe.supported ? null : wireframe.reason;
  info.generatedIndexCount = wireframe.generatedIndexCount ?? 0;
  info.sourceTriangleCount = wireframe.sourceTriangleCount ?? 0;
  info.emittedTriangleCount = wireframe.emittedTriangleCount ?? 0;
  info.culledTriangleCount = wireframe.culledTriangleCount ?? 0;
  info.degenerateTriangleCount = wireframe.degenerateTriangleCount ?? 0;
  info.cwTriangleCount = wireframe.cwTriangleCount ?? 0;
  info.ccwTriangleCount = wireframe.ccwTriangleCount ?? 0;
  info.cullingRequested = wireframe.cullingRequested === true;
  info.cullingApplied = wireframe.cullingApplied === true;
  info.indexTypeName = wireframe.indexTypeName ?? info.indexTypeName;
  if (wireframe.supported) {
    info.glPrimitive = gl.LINES;
    info.glPrimitiveName = glPrimitiveName(info.glPrimitive);
    info.drawIndexCount = wireframe.generatedIndexCount;
    info.drawIndexByteOffset = 0;
    info.lineIndices = wireframe.lineIndices;
    info.temporaryIndexBuffer = true;
  }
  return info;
}

function hasD3D8FirstVertexConventionExtension() {
  return Boolean(provokingVertex &&
      typeof provokingVertex.provokingVertexWEBGL === "function" &&
      typeof provokingVertex.FIRST_VERTEX_CONVENTION_WEBGL === "number" &&
      typeof provokingVertex.LAST_VERTEX_CONVENTION_WEBGL === "number");
}

// Current provoking-vertex convention; WebGL contexts start with LAST. Only
// flat-shaded draws read flat varyings (uUseFlatShade gates vFlatColor), so
// the active convention is irrelevant to every other draw and can be tracked
// lazily instead of set/restored around each flat draw.
let d3d8ProvokingVertexFirstApplied = false;

function setD3D8FirstVertexConvention(enabled) {
  if (!hasD3D8FirstVertexConventionExtension()) {
    return false;
  }
  const wantFirst = enabled === true;
  if (d3d8ProvokingVertexFirstApplied === wantFirst) {
    return true;
  }
  if (wantFirst) {
    provokingVertex.provokingVertexWEBGL(provokingVertex.FIRST_VERTEX_CONVENTION_WEBGL);
  } else {
    provokingVertex.provokingVertexWEBGL(provokingVertex.LAST_VERTEX_CONVENTION_WEBGL);
  }
  d3d8ProvokingVertexFirstApplied = wantFirst;
  return true;
}

function createD3D8ShadeModeDrawInfo(
  renderState,
  primitiveType,
  indexResource,
  indexByteOffset,
  indexCount,
  indexSize,
  fillModeDraw,
) {
  const mode = Number(renderState.shadeMode ?? D3DSHADE_GOURAUD) >>> 0;
  const flat = mode === D3DSHADE_FLAT;
  const info = {
    mode,
    modeName: d3dShadeModeName(mode),
    flat,
    gouraud: mode === D3DSHADE_GOURAUD,
    phongRequested: mode === D3DSHADE_PHONG,
    usesFlatShader: flat,
    usesFirstVertexConvention: false,
    rotatedIndexBuffer: false,
    temporaryIndexBuffer: false,
    glPrimitive: fillModeDraw.glPrimitive,
    glPrimitiveName: fillModeDraw.glPrimitiveName,
    drawIndexCount: fillModeDraw.drawIndexCount,
    drawIndexByteOffset: fillModeDraw.drawIndexByteOffset,
    generatedIndexCount: 0,
    sourceTriangleCount: 0,
    indexTypeName: indexSize === 4 ? "uint32" : "uint16",
    supported: fillModeDraw.supported,
    fallbackReason: fillModeDraw.fallbackReason,
  };

  if (!info.supported || !flat) {
    return info;
  }

  if (fillModeDraw.temporaryIndexBuffer || !d3dPrimitiveIsTriangle(primitiveType)) {
    return info;
  }

  if (hasD3D8FirstVertexConventionExtension()) {
    info.usesFirstVertexConvention = true;
    return info;
  }

  const flatShade = buildD3D8FlatShadeIndices(
    indexResource,
    indexByteOffset,
    indexCount,
    indexSize,
    primitiveType,
  );
  info.supported = flatShade.supported;
  info.fallbackReason = flatShade.supported ? null : flatShade.reason;
  info.generatedIndexCount = flatShade.generatedIndexCount ?? 0;
  info.sourceTriangleCount = flatShade.sourceTriangleCount ?? 0;
  info.indexTypeName = flatShade.indexTypeName ?? info.indexTypeName;
  if (flatShade.supported) {
    info.glPrimitive = gl.TRIANGLES;
    info.glPrimitiveName = glPrimitiveName(info.glPrimitive);
    info.drawIndexCount = flatShade.generatedIndexCount;
    info.drawIndexByteOffset = 0;
    info.triangleIndices = flatShade.triangleIndices;
    info.rotatedIndexBuffer = true;
    info.temporaryIndexBuffer = true;
  }
  return info;
}

const d3d8LiteSolidDrawInfo = {
  fillModeDraw: {},
  shadeModeDraw: {},
};

// Lite draws consume this synchronously and never retain it, so one stable
// object can carry the per-draw offsets without feeding the garbage collector.
function setD3D8LiteSolidDrawInfo(renderState, primitiveType, indexByteOffset, indexCount) {
  const fillMode = Number(renderState.fillMode ?? D3DFILL_SOLID) >>> 0;
  const shadeMode = Number(renderState.shadeMode ?? D3DSHADE_GOURAUD) >>> 0;
  if (fillMode !== D3DFILL_SOLID || shadeMode === D3DSHADE_FLAT) {
    return null;
  }
  const glPrimitive = d3dPrimitiveToGl(primitiveType);
  const supported = d3d8GlPrimitiveSupported(glPrimitive);
  const fallbackReason = supported ? null : "unsupportedPrimitive";
  const fillModeDraw = d3d8LiteSolidDrawInfo.fillModeDraw;
  fillModeDraw.glPrimitive = glPrimitive;
  fillModeDraw.drawIndexCount = indexCount;
  fillModeDraw.drawIndexByteOffset = indexByteOffset;
  fillModeDraw.temporaryIndexBuffer = false;
  fillModeDraw.supported = supported;
  fillModeDraw.fallbackReason = fallbackReason;
  const shadeModeDraw = d3d8LiteSolidDrawInfo.shadeModeDraw;
  shadeModeDraw.usesFlatShader = false;
  shadeModeDraw.usesFirstVertexConvention = false;
  shadeModeDraw.glPrimitive = glPrimitive;
  shadeModeDraw.drawIndexCount = indexCount;
  shadeModeDraw.drawIndexByteOffset = indexByteOffset;
  shadeModeDraw.supported = supported;
  shadeModeDraw.fallbackReason = fallbackReason;
  return d3d8LiteSolidDrawInfo;
}

function d3d8FillModeProbeInfo(fillModeDraw) {
  if (!fillModeDraw) {
    return null;
  }
  return {
    mode: fillModeDraw.mode,
    modeName: fillModeDraw.modeName,
    requestedPrimitiveType: fillModeDraw.requestedPrimitiveType,
    originalPrimitiveName: fillModeDraw.originalPrimitiveName,
    glPrimitiveName: fillModeDraw.glPrimitiveName,
    drawIndexCount: fillModeDraw.drawIndexCount,
    drawIndexByteOffset: fillModeDraw.drawIndexByteOffset,
    generatedIndexCount: fillModeDraw.generatedIndexCount,
    sourceTriangleCount: fillModeDraw.sourceTriangleCount,
    emittedTriangleCount: fillModeDraw.emittedTriangleCount,
    culledTriangleCount: fillModeDraw.culledTriangleCount,
    degenerateTriangleCount: fillModeDraw.degenerateTriangleCount,
    cwTriangleCount: fillModeDraw.cwTriangleCount,
    ccwTriangleCount: fillModeDraw.ccwTriangleCount,
    cullMode: fillModeDraw.cullMode,
    cullingRequested: fillModeDraw.cullingRequested,
    cullingApplied: fillModeDraw.cullingApplied,
    indexTypeName: fillModeDraw.indexTypeName,
    temporaryIndexBuffer: fillModeDraw.temporaryIndexBuffer,
    pointFill: fillModeDraw.pointFill,
    wireframe: fillModeDraw.wireframe,
    supported: fillModeDraw.supported,
    fallbackReason: fillModeDraw.fallbackReason,
  };
}

function d3d8ShadeModeProbeInfo(shadeModeDraw) {
  if (!shadeModeDraw) {
    return null;
  }
  return {
    mode: shadeModeDraw.mode,
    modeName: shadeModeDraw.modeName,
    flat: shadeModeDraw.flat,
    gouraud: shadeModeDraw.gouraud,
    phongRequested: shadeModeDraw.phongRequested,
    usesFlatShader: shadeModeDraw.usesFlatShader,
    usesFirstVertexConvention: shadeModeDraw.usesFirstVertexConvention,
    rotatedIndexBuffer: shadeModeDraw.rotatedIndexBuffer,
    temporaryIndexBuffer: shadeModeDraw.temporaryIndexBuffer,
    glPrimitiveName: shadeModeDraw.glPrimitiveName,
    drawIndexCount: shadeModeDraw.drawIndexCount,
    drawIndexByteOffset: shadeModeDraw.drawIndexByteOffset,
    generatedIndexCount: shadeModeDraw.generatedIndexCount,
    sourceTriangleCount: shadeModeDraw.sourceTriangleCount,
    indexTypeName: shadeModeDraw.indexTypeName,
    supported: shadeModeDraw.supported,
    fallbackReason: shadeModeDraw.fallbackReason,
  };
}

function pixelHasColor(pixel, threshold = 8) {
  return Array.isArray(pixel) && pixel.slice(0, 3).some((component) => component > threshold);
}

function copyD3DMatrixFromHeap(ptr, scratch) {
  const address = Number(ptr ?? 0) >>> 0;
  const heap = getHeapF32();
  if (address === 0 || !(heap instanceof Float32Array)) {
    return null;
  }
  let target = scratch;
  if (!(target instanceof Float32Array) || target.length !== 16) {
    target = new Float32Array(16);
    if (d3d8PerfCountersEnabled) d3d8PerfStats.drawMatrixAllocatedCopies += 1;
  }
  const offset = address >>> 2;
  if (offset + 16 > heap.length) {
    return null;
  }
  for (let index = 0; index < 16; ++index) {
    const value = heap[offset + index];
    if (!Number.isFinite(value)) {
      return null;
    }
    target[index] = value;
  }
  if (d3d8PerfCountersEnabled) d3d8PerfStats.drawMatrixNormalizations += 1;
  if (d3d8PerfCountersEnabled) d3d8PerfStats.drawMatrixScratchCopies += 1;
  return target;
}

function normalizeD3DMatrix(matrix, scratch = null) {
  if (typeof matrix === "number") {
    return copyD3DMatrixFromHeap(matrix, scratch);
  }
  const isSequence = Array.isArray(matrix) || ArrayBuffer.isView(matrix);
  if (!isSequence || matrix.length !== 16) {
    return null;
  }
  for (let index = 0; index < 16; ++index) {
    if (!Number.isFinite(matrix[index])) {
      return null;
    }
  }
  if (d3d8PerfCountersEnabled) d3d8PerfStats.drawMatrixNormalizations += 1;
  if (scratch instanceof Float32Array && scratch.length === 16) {
    scratch.set(matrix);
    if (d3d8PerfCountersEnabled) d3d8PerfStats.drawMatrixScratchCopies += 1;
    return scratch;
  }
  if (matrix instanceof Float32Array) {
    return matrix;
  }
  if (d3d8PerfCountersEnabled) d3d8PerfStats.drawMatrixAllocatedCopies += 1;
  return new Float32Array(matrix);
}

function d3d8MatrixEquals(left, right) {
  if (left === right) {
    return left !== null;
  }
  if (!left || !right || left.length !== 16 || right.length !== 16) {
    return false;
  }
  for (let index = 0; index < 16; ++index) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function d3d8NumericArrayEquals(left, right) {
  if (left === right) {
    return true;
  }
  if (!left || !right || left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; ++index) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

// Per-location uniform value caches. The group-level keys in the draw path
// skip whole uniform blocks when nothing in the group changed, but a group
// miss re-runs every setter in the block while typically only one or two
// values actually differ. These setters store the last uploaded value on the
// WebGLUniformLocation itself and skip redundant gl.uniform* calls. Each
// location object is fetched exactly once per program (createD3D8DrawProgram /
// the depth-stencil program), and GL uniform state is per-program, so caching
// on the location is exact and survives program switches. Every skipped call
// also saves the GPU process one command to decode — the saturated resource
// in unit-heavy scenes.
function d3d8CachedUniform1i(location, value) {
  if (!location) {
    return;
  }
  if (location.__cncLast === value) {
    if (d3d8PerfCountersEnabled) d3d8PerfStats.uniformGlSkipped += 1;
    return;
  }
  location.__cncLast = value;
  if (d3d8PerfCountersEnabled) d3d8PerfStats.uniformGlCalls += 1;
  gl.uniform1i(location, value);
}

function d3d8CachedUniform1f(location, value) {
  if (!location) {
    return;
  }
  if (location.__cncLast === value) {
    if (d3d8PerfCountersEnabled) d3d8PerfStats.uniformGlSkipped += 1;
    return;
  }
  location.__cncLast = value;
  if (d3d8PerfCountersEnabled) d3d8PerfStats.uniformGlCalls += 1;
  gl.uniform1f(location, value);
}

function d3d8CachedUniform2f(location, x, y) {
  if (!location) {
    return;
  }
  if (location.__cncLastX === x && location.__cncLastY === y) {
    if (d3d8PerfCountersEnabled) d3d8PerfStats.uniformGlSkipped += 1;
    return;
  }
  location.__cncLastX = x;
  location.__cncLastY = y;
  if (d3d8PerfCountersEnabled) d3d8PerfStats.uniformGlCalls += 1;
  gl.uniform2f(location, x, y);
}

function d3d8CachedUniform4f(location, x, y, z, w) {
  if (!location) {
    return;
  }
  if (location.__cncLastX === x && location.__cncLastY === y &&
      location.__cncLastZ === z && location.__cncLastW === w) {
    if (d3d8PerfCountersEnabled) d3d8PerfStats.uniformGlSkipped += 1;
    return;
  }
  location.__cncLastX = x;
  location.__cncLastY = y;
  location.__cncLastZ = z;
  location.__cncLastW = w;
  if (d3d8PerfCountersEnabled) d3d8PerfStats.uniformGlCalls += 1;
  gl.uniform4f(location, x, y, z, w);
}

function d3d8CachedUniformMatrix4fv(location, matrix) {
  if (!location) {
    return;
  }
  const cached = location.__cncLastMat;
  if (cached && d3d8MatrixEquals(cached, matrix)) {
    if (d3d8PerfCountersEnabled) d3d8PerfStats.uniformGlSkipped += 1;
    return;
  }
  location.__cncLastMat = rememberD3D8TransformUniformSnapshot(cached, matrix);
  if (d3d8PerfCountersEnabled) d3d8PerfStats.uniformGlCalls += 1;
  gl.uniformMatrix4fv(location, false, matrix);
}

function d3d8CachedUniformMatrix3fv(location, matrix) {
  if (!location) {
    return;
  }
  const cached = location.__cncLastMat3;
  if (cached && d3d8NumericArrayEquals(cached, matrix)) {
    if (d3d8PerfCountersEnabled) d3d8PerfStats.uniformGlSkipped += 1;
    return;
  }
  const snapshot = cached instanceof Float32Array && cached.length === 9
    ? cached
    : new Float32Array(9);
  snapshot.set(matrix);
  location.__cncLastMat3 = snapshot;
  if (d3d8PerfCountersEnabled) d3d8PerfStats.uniformGlCalls += 1;
  gl.uniformMatrix3fv(location, false, matrix);
}

// CPU-side equivalent of transpose(inverse(mat3(uWorld))). The generic D3D8
// vertex shader has to calculate that expression per vertex because its state
// is fully dynamic. Narrow fixed-function programs can instead upload the
// exact matrix once per object, which is much cheaper on mobile tile GPUs.
function d3d8WorldNormalMatrix(world, target = d3d8DrawMatrixScratch.worldNormal) {
  if (!world || world.length !== 16 || !(target instanceof Float32Array) || target.length !== 9) {
    return null;
  }
  const a = world[0];
  const b = world[4];
  const c = world[8];
  const d = world[1];
  const e = world[5];
  const f = world[9];
  const g = world[2];
  const h = world[6];
  const i = world[10];
  const c00 = e * i - f * h;
  const c01 = f * g - d * i;
  const c02 = d * h - e * g;
  const c10 = c * h - b * i;
  const c11 = a * i - c * g;
  const c12 = b * g - a * h;
  const c20 = b * f - c * e;
  const c21 = c * d - a * f;
  const c22 = a * e - b * d;
  const determinant = a * c00 + b * c01 + c * c02;
  if (!Number.isFinite(determinant) || Math.abs(determinant) <= 1e-12) {
    return null;
  }
  const inverseDeterminant = 1 / determinant;
  target[0] = c00 * inverseDeterminant;
  target[1] = c10 * inverseDeterminant;
  target[2] = c20 * inverseDeterminant;
  target[3] = c01 * inverseDeterminant;
  target[4] = c11 * inverseDeterminant;
  target[5] = c21 * inverseDeterminant;
  target[6] = c02 * inverseDeterminant;
  target[7] = c12 * inverseDeterminant;
  target[8] = c22 * inverseDeterminant;
  return target;
}

function setD3D8Uniform3FromArray(location, values) {
  if (!location) {
    return;
  }
  if (location.__cncLastX === values[0] && location.__cncLastY === values[1] &&
      location.__cncLastZ === values[2]) {
    if (d3d8PerfCountersEnabled) d3d8PerfStats.uniformGlSkipped += 1;
    return;
  }
  location.__cncLastX = values[0];
  location.__cncLastY = values[1];
  location.__cncLastZ = values[2];
  if (d3d8PerfCountersEnabled) d3d8PerfStats.uniformGlCalls += 1;
  gl.uniform3f(location, values[0], values[1], values[2]);
}

function setD3D8Uniform4FromArray(location, values) {
  d3d8CachedUniform4f(location, values[0], values[1], values[2], values[3]);
}

function resetD3D8TransformUniformCache() {
  d3d8LastTransformSourceWorld = null;
  d3d8LastTransformSourceView = null;
  d3d8LastTransformSourceProjection = null;
  d3d8LastTransformSourceWorldRevision = 0;
  d3d8LastTransformSourceViewRevision = 0;
  d3d8LastTransformSourceProjectionRevision = 0;
  invalidateD3D8TransformUniformGeneration();
}

function invalidateD3D8TransformUniformGeneration() {
  d3d8TransformUniformGeneration = (d3d8TransformUniformGeneration + 1) >>> 0;
  if (d3d8TransformUniformGeneration === 0) {
    d3d8TransformUniformGeneration = 1;
  }
}

// Returns true when this program already has the exact matrix and no WebGL
// command was needed. Native revisions are the fast path; revision-less
// callers and repeated same-value SetTransform calls retain exact comparison.
function d3d8TransformUniformMatchesOrUpload(location, matrix, revision) {
  if (!location) {
    return true;
  }
  const transformRevision = Number(revision ?? 0) >>> 0;
  const generationMatches =
    location.__cncTransformGeneration === d3d8TransformUniformGeneration;
  if (generationMatches && transformRevision !== 0 &&
      location.__cncTransformRevision === transformRevision) {
    if (d3d8PerfCountersEnabled) d3d8PerfStats.uniformGlSkipped += 1;
    return true;
  }
  const cached = location.__cncTransformMatrix;
  if (generationMatches && cached && d3d8MatrixEquals(cached, matrix)) {
    location.__cncTransformRevision = transformRevision;
    if (d3d8PerfCountersEnabled) d3d8PerfStats.uniformGlSkipped += 1;
    return true;
  }
  location.__cncTransformGeneration = d3d8TransformUniformGeneration;
  location.__cncTransformRevision = transformRevision;
  location.__cncTransformMatrix = rememberD3D8TransformUniformSnapshot(cached, matrix);
  if (d3d8PerfCountersEnabled) d3d8PerfStats.uniformGlCalls += 1;
  gl.uniformMatrix4fv(location, false, matrix);
  return false;
}

function rememberD3D8TransformUniformSnapshot(cached, values) {
  const snapshot = cached instanceof Float32Array && cached.length === 16
    ? cached
    : new Float32Array(16);
  snapshot.set(values);
  return snapshot;
}

function rememberD3D8WorldTransformUniform(world) {
  d3d8LastTransformSourceWorld = rememberD3D8TransformUniformSnapshot(
    d3d8LastTransformSourceWorld,
    world,
  );
}

function rememberD3D8ViewTransformUniform(view) {
  d3d8LastTransformSourceView = rememberD3D8TransformUniformSnapshot(
    d3d8LastTransformSourceView,
    view,
  );
}

function rememberD3D8ProjectionTransformUniform(projection) {
  d3d8LastTransformSourceProjection = rememberD3D8TransformUniformSnapshot(
    d3d8LastTransformSourceProjection,
    projection,
  );
}

function d3d8MaterialUniformsEqual(renderState, material) {
  const cached = d3d8LastMaterialUniformInfo;
  return cached !== null &&
    cached.ambient === renderState.ambient &&
    cached.power === material.power &&
    cached.diffuseMaterialSource === renderState.diffuseMaterialSource &&
    cached.specularMaterialSource === renderState.specularMaterialSource &&
    cached.ambientMaterialSource === renderState.ambientMaterialSource &&
    cached.emissiveMaterialSource === renderState.emissiveMaterialSource &&
    d3d8NumericArrayEquals(cached.diffuse, material.diffuse) &&
    d3d8NumericArrayEquals(cached.materialAmbient, material.ambient) &&
    d3d8NumericArrayEquals(cached.specular, material.specular) &&
    d3d8NumericArrayEquals(cached.emissive, material.emissive);
}

function rememberD3D8MaterialUniforms(renderState, material) {
  d3d8LastMaterialUniformInfo = {
    ambient: renderState.ambient,
    diffuse: material.diffuse.slice(),
    materialAmbient: material.ambient.slice(),
    specular: material.specular.slice(),
    emissive: material.emissive.slice(),
    power: material.power,
    diffuseMaterialSource: renderState.diffuseMaterialSource,
    specularMaterialSource: renderState.specularMaterialSource,
    ambientMaterialSource: renderState.ambientMaterialSource,
    emissiveMaterialSource: renderState.emissiveMaterialSource,
  };
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

function multiplyD3D8ColumnMatrixVector(matrix, vector) {
  if (!matrix || matrix.length !== 16) {
    return vector.slice();
  }
  const [x, y, z, w] = vector;
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12] * w,
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13] * w,
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14] * w,
    matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15] * w,
  ];
}

function readD3D8Float32(view, offset) {
  if (!view || offset < 0 || offset + 4 > view.byteLength) {
    return 0;
  }
  const value = view.getFloat32(offset, true);
  return Number.isFinite(value) ? value : 0;
}

function d3d8DiffuseRgbaFromBytes(bytes, offset) {
  if (!(bytes instanceof Uint8Array) || offset < 0 || offset + 4 > bytes.byteLength) {
    return null;
  }
  return [
    bytes[offset + 2],
    bytes[offset + 1],
    bytes[offset],
    bytes[offset + 3],
  ];
}

function collectD3D8IndexedVertexIndices(indexResource, indexByteOffset, indexCount, indexSize, availableVertices) {
  const indexBytes = indexResource?.bytes;
  const requiredByteSize = indexByteOffset + indexCount * indexSize;
  if (!(indexBytes instanceof Uint8Array) ||
      requiredByteSize > indexBytes.byteLength ||
      (indexSize !== 2 && indexSize !== 4) ||
      availableVertices <= 0) {
    return null;
  }

  const indices = new Set();
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let outOfRange = 0;
  for (let index = 0; index < indexCount; ++index) {
    const vertexIndex = readD3D8Index(indexBytes, indexByteOffset, index, indexSize);
    if (!Number.isInteger(vertexIndex) || vertexIndex < 0 || vertexIndex >= availableVertices) {
      outOfRange += 1;
      continue;
    }
    indices.add(vertexIndex);
    min = Math.min(min, vertexIndex);
    max = Math.max(max, vertexIndex);
  }

  if (indices.size === 0) {
    return { indices: [], min: null, max: null, outOfRange };
  }
  return {
    indices: Array.from(indices).sort((left, right) => left - right),
    min,
    max,
    outOfRange,
  };
}

function inspectD3D8DrawVertices(resource, byteOffset, vertexStride, vertexCount, vertexLayout,
    transforms, viewport, indexResource = null, indexByteOffset = 0, indexCount = 0, indexSize = 0) {
  const bytes = resource?.bytes;
  if (!(bytes instanceof Uint8Array) || vertexStride < 12 || vertexCount === 0) {
    return null;
  }
  const availableVertices = Math.min(
    vertexCount,
    Math.floor(Math.max(0, bytes.byteLength - byteOffset) / vertexStride),
  );
  if (availableVertices <= 0) {
    return null;
  }
  const indexedVertices = collectD3D8IndexedVertexIndices(
    indexResource,
    indexByteOffset,
    indexCount,
    indexSize,
    availableVertices,
  );
  const inspectedVertexIndices = indexedVertices?.indices?.length
    ? indexedVertices.indices
    : Array.from({ length: availableVertices }, (_, index) => index);

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const bounds = {
    min: [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
    max: [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
  };
  const diffuse = {
    available: vertexLayout?.diffuseOffset !== null,
    sampleCount: 0,
    nonBlackRgb: 0,
    checksum: 2166136261,
    min: [255, 255, 255, 255],
    max: [0, 0, 0, 0],
    average: [0, 0, 0, 0],
  };
  const pretransformed = vertexLayout?.pretransformed === true;
  const projected = (transforms || pretransformed) ? {
    sampleCount: 0,
    visible: 0,
    behindOrInvalidW: 0,
    ndcMin: [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
    ndcMax: [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
    screenMin: [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
    screenMax: [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
    clipWMin: Number.POSITIVE_INFINITY,
    clipWMax: Number.NEGATIVE_INFINITY,
  } : null;
  const samples = [];
  const sampleCount = Math.min(8, inspectedVertexIndices.length);
  const sampleIndices = new Set(Array.from({ length: sampleCount }, (_, index) =>
    inspectedVertexIndices[Math.min(
      inspectedVertexIndices.length - 1,
      Math.floor((index * (inspectedVertexIndices.length - 1)) / 7),
    )]));

  for (const vertexIndex of inspectedVertexIndices) {
    const base = byteOffset + vertexIndex * vertexStride;
    const position = [
      readD3D8Float32(view, base),
      readD3D8Float32(view, base + 4),
      readD3D8Float32(view, base + 8),
    ];
    const positionRhw = pretransformed && base + 16 <= bytes.byteLength
      ? readD3D8Float32(view, base + 12)
      : null;
    for (let axis = 0; axis < 3; ++axis) {
      bounds.min[axis] = Math.min(bounds.min[axis], position[axis]);
      bounds.max[axis] = Math.max(bounds.max[axis], position[axis]);
    }

    const diffuseOffset = vertexLayout?.diffuseOffset;
    const rgba = diffuse.available
      ? d3d8DiffuseRgbaFromBytes(bytes, base + diffuseOffset)
      : null;
    if (rgba) {
      diffuse.sampleCount += 1;
      if (rgba[0] > 0 || rgba[1] > 0 || rgba[2] > 0) {
        diffuse.nonBlackRgb += 1;
      }
      for (let component = 0; component < 4; ++component) {
        diffuse.min[component] = Math.min(diffuse.min[component], rgba[component]);
        diffuse.max[component] = Math.max(diffuse.max[component], rgba[component]);
        diffuse.average[component] += rgba[component];
        diffuse.checksum = Math.imul(diffuse.checksum ^ rgba[component], 16777619) >>> 0;
      }
    }

    if (projected) {
      let ndcInfo = null;
      if (pretransformed) {
        ndcInfo = projectD3D8PretransformedVertex(bytes, byteOffset, vertexStride, viewport, vertexIndex);
      } else if (transforms) {
        const worldPosition = multiplyD3D8ColumnMatrixVector(transforms.world, [...position, 1]);
        const viewPosition = multiplyD3D8ColumnMatrixVector(transforms.view, worldPosition);
        const d3dClip = multiplyD3D8ColumnMatrixVector(transforms.projection, viewPosition);
        const glClip = [d3dClip[0], d3dClip[1], d3dClip[2] * 2.0 - d3dClip[3], d3dClip[3]];
        ndcInfo = Math.abs(glClip[3]) <= 0.000001
          ? null
          : { ndc: [glClip[0] / glClip[3], glClip[1] / glClip[3], glClip[2] / glClip[3]], clipW: glClip[3] };
      }
      projected.sampleCount += 1;
      if (!ndcInfo) {
        projected.behindOrInvalidW += 1;
      } else {
        const { ndc, clipW } = ndcInfo;
        projected.clipWMin = Math.min(projected.clipWMin, clipW);
        projected.clipWMax = Math.max(projected.clipWMax, clipW);
        for (let axis = 0; axis < 3; ++axis) {
          projected.ndcMin[axis] = Math.min(projected.ndcMin[axis], ndc[axis]);
          projected.ndcMax[axis] = Math.max(projected.ndcMax[axis], ndc[axis]);
        }
        if (ndc[0] >= -1 && ndc[0] <= 1 && ndc[1] >= -1 && ndc[1] <= 1 && ndc[2] >= -1 && ndc[2] <= 1) {
          projected.visible += 1;
        }
        if (viewport?.gl) {
          const screenX = viewport.gl.x + (ndc[0] * 0.5 + 0.5) * viewport.gl.width;
          const screenY = viewport.gl.y + (1.0 - (ndc[1] * 0.5 + 0.5)) * viewport.gl.height;
          projected.screenMin[0] = Math.min(projected.screenMin[0], screenX);
          projected.screenMin[1] = Math.min(projected.screenMin[1], screenY);
          projected.screenMax[0] = Math.max(projected.screenMax[0], screenX);
          projected.screenMax[1] = Math.max(projected.screenMax[1], screenY);
        }
      }
    }

    if (sampleIndices.has(vertexIndex)) {
      const texCoords = [];
      for (const texCoord of vertexLayout?.texCoords ?? []) {
        if (texCoord.available) {
          const coordBase = base + texCoord.offset;
          texCoords.push({
            coordSet: texCoord.coordSet,
            uv: [
              readD3D8Float32(view, coordBase),
              readD3D8Float32(view, coordBase + 4),
            ],
          });
        }
      }
      samples.push({
        index: vertexIndex,
        position,
        rhw: positionRhw,
        diffuse: rgba,
        texCoords,
      });
    }
  }

  if (diffuse.sampleCount > 0) {
    for (let component = 0; component < 4; ++component) {
      diffuse.average[component] = Number((diffuse.average[component] / diffuse.sampleCount).toFixed(3));
    }
  } else {
    diffuse.checksum = null;
    diffuse.min = null;
    diffuse.max = null;
    diffuse.average = null;
  }

  return {
    availableVertices,
    inspectedVertices: inspectedVertexIndices.length,
    indexRange: indexedVertices ? {
      min: indexedVertices.min,
      max: indexedVertices.max,
      outOfRange: indexedVertices.outOfRange,
    } : null,
    positionBounds: bounds,
    diffuse,
    projected,
    samples,
  };
}

function inspectD3D8IndexedTriangles(vertexResource, vertexByteOffset, vertexStride,
    indexResource, indexByteOffset, indexCount, indexSize, primitiveType, transforms,
    vertexLayout = null, viewport = null) {
  const vertexBytes = vertexResource?.bytes;
  const indexBytes = indexResource?.bytes;
  if (!(vertexBytes instanceof Uint8Array) ||
      !(indexBytes instanceof Uint8Array) ||
      vertexStride < 12 ||
      (!transforms && vertexLayout?.pretransformed !== true) ||
      indexCount < 3 ||
      (indexSize !== 2 && indexSize !== 4)) {
    return null;
  }

  const readProjected = (vertexIndex) => {
    if (vertexLayout?.pretransformed === true) {
      return projectD3D8PretransformedVertex(
        vertexBytes,
        vertexByteOffset,
        vertexStride,
        viewport,
        vertexIndex,
      )?.ndc ?? null;
    }
    return projectD3D8VertexToNdc(vertexBytes, vertexByteOffset, vertexStride, transforms, vertexIndex);
  };
  const areaFor = (ia, ib, ic) => {
    return d3d8ProjectedTriangleArea(readProjected(ia), readProjected(ib), readProjected(ic));
  };
  const readIndex = (index) => readD3D8Index(indexBytes, indexByteOffset, index, indexSize);
  const result = {
    primitiveType,
    inspected: 0,
    cw: 0,
    ccw: 0,
    degenerate: 0,
    samples: [],
  };
  const recordTriangle = (triangleIndex, ia, ib, ic) => {
    if (ia < 0 || ib < 0 || ic < 0) {
      return;
    }
    const area = areaFor(ia, ib, ic);
    if (!Number.isFinite(area)) {
      return;
    }
    result.inspected += 1;
    if (Math.abs(area) <= 0.0000001) {
      result.degenerate += 1;
    } else if (area < 0) {
      result.cw += 1;
    } else {
      result.ccw += 1;
    }
    if (result.samples.length < 8) {
      result.samples.push({
        triangleIndex,
        indices: [ia, ib, ic],
        ndcSignedArea: Number(area.toFixed(8)),
        winding: Math.abs(area) <= 0.0000001 ? "degenerate" : (area < 0 ? "cw" : "ccw"),
      });
    }
  };

  if (primitiveType === D3DPT_TRIANGLELIST) {
    const triangleCount = Math.floor(indexCount / 3);
    for (let triangleIndex = 0; triangleIndex < triangleCount; ++triangleIndex) {
      const index = triangleIndex * 3;
      recordTriangle(triangleIndex, readIndex(index), readIndex(index + 1), readIndex(index + 2));
    }
  } else if (primitiveType === D3DPT_TRIANGLESTRIP) {
    for (let triangleIndex = 0; triangleIndex < indexCount - 2; ++triangleIndex) {
      const ia = readIndex(triangleIndex);
      const ib = readIndex(triangleIndex + 1);
      const ic = readIndex(triangleIndex + 2);
      if (ia === ib || ib === ic || ia === ic) {
        result.degenerate += 1;
        continue;
      }
      if (triangleIndex % 2 === 0) {
        recordTriangle(triangleIndex, ia, ib, ic);
      } else {
        recordTriangle(triangleIndex, ib, ia, ic);
      }
    }
  }

  return result.inspected > 0 ? result : null;
}

function d3d8TextureStageDrawSummary(textureStage = {}) {
  return {
    colorOp: textureStage.colorOp,
    colorArg0: textureStage.colorArg0,
    colorArg1: textureStage.colorArg1,
    colorArg2: textureStage.colorArg2,
    alphaOp: textureStage.alphaOp,
    alphaArg0: textureStage.alphaArg0,
    alphaArg1: textureStage.alphaArg1,
    alphaArg2: textureStage.alphaArg2,
    texCoordIndex: textureStage.texCoordIndex,
    addressU: textureStage.addressU,
    addressV: textureStage.addressV,
    minFilter: textureStage.minFilter,
    magFilter: textureStage.magFilter,
    mipFilter: textureStage.mipFilter,
    textureTransformFlags: textureStage.textureTransformFlags,
  };
}

function d3d8DrawVertexSummary(vertexDiagnostics) {
  if (!vertexDiagnostics) {
    return null;
  }
  return {
    availableVertices: vertexDiagnostics.availableVertices,
    inspectedVertices: vertexDiagnostics.inspectedVertices,
    indexRange: vertexDiagnostics.indexRange,
    positionBounds: vertexDiagnostics.positionBounds,
    diffuse: vertexDiagnostics.diffuse,
    projected: vertexDiagnostics.projected,
    triangles: vertexDiagnostics.triangles,
    samples: vertexDiagnostics.samples,
  };
}

function sampleD3D8TextureAtVertexSamples(resource, vertexDiagnostics, coordSet) {
  if (!resource?.width || !resource?.height || !Array.isArray(vertexDiagnostics?.samples)) {
    return [];
  }
  const samples = [];
  for (const sample of vertexDiagnostics.samples) {
    const texCoord = sample.texCoords?.find((coord) => coord.coordSet === coordSet);
    if (!texCoord) {
      continue;
    }
    const u = Number(texCoord.uv?.[0] ?? 0);
    const v = Number(texCoord.uv?.[1] ?? 0);
    if (!Number.isFinite(u) || !Number.isFinite(v)) {
      continue;
    }
    const x = Math.max(0, Math.min(resource.width - 1, Math.floor(u * resource.width)));
    const y = Math.max(0, Math.min(resource.height - 1, Math.floor(v * resource.height)));
    samples.push({
      vertexIndex: sample.index,
      uv: [u, v],
      xy: [x, y],
      pixel: sampleD3D8TexturePixel(resource, x, y),
    });
  }
  return samples;
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

function normalizeD3D8ClipPlanes(clipPlanes) {
  return Array.from({ length: D3D8_CLIP_PLANE_COUNT }, (_, planeIndex) => {
    const source = Array.isArray(clipPlanes) ? clipPlanes[planeIndex] : null;
    return Array.from({ length: 4 }, (_, component) => {
      const value = Number(Array.isArray(source) ? source[component] : 0);
      return Number.isFinite(value) ? value : 0;
    });
  });
}

function flattenD3D8ClipPlanes(clipPlanes) {
  const flat = new Float32Array(D3D8_CLIP_PLANE_COUNT * 4);
  for (let planeIndex = 0; planeIndex < D3D8_CLIP_PLANE_COUNT; ++planeIndex) {
    for (let component = 0; component < 4; ++component) {
      flat[planeIndex * 4 + component] = clipPlanes[planeIndex]?.[component] ?? 0;
    }
  }
  return flat;
}

function d3d8ClipPlaneMask(renderState) {
  return renderState.clipping !== 0
    ? (renderState.clipPlaneEnable & ((1 << D3D8_CLIP_PLANE_COUNT) - 1))
    : 0;
}

// Immutable fallbacks for state that the active lite-mode shader cannot read.
// Derived-cache entries may share these because no draw path mutates them.
const D3D8_UNUSED_CLIP_PLANES = normalizeD3D8ClipPlanes();
const D3D8_UNUSED_MATERIAL = normalizeD3D8Material();
const D3D8_UNUSED_LIGHTS = Object.freeze([]);
const D3D8_DISABLED_CLIP_PLANE_INFO = Object.freeze({
  enabled: false,
  clipping: 0,
  mask: 0,
  enabledIndices: Object.freeze([]),
  planes: D3D8_UNUSED_CLIP_PLANES,
});

function d3d8ClipPlaneInfo(renderState, clipPlanes) {
  const mask = d3d8ClipPlaneMask(renderState);
  if (mask === 0 && d3d8DiagLevel !== "full") {
    return D3D8_DISABLED_CLIP_PLANE_INFO;
  }
  return {
    enabled: mask !== 0,
    clipping: renderState.clipping,
    mask,
    enabledIndices: Array.from({ length: D3D8_CLIP_PLANE_COUNT }, (_, index) => index)
      .filter((index) => (mask & (1 << index)) !== 0),
    planes: clipPlanes.map((plane) => plane.slice()),
  };
}

// Detect and count terrain noise/cloud/lightmap "detail" multiply passes.
//
// The original engine renders the fine terrain noise + lightmap detail through
// the fixed-function TerrainShader2Stage noise/cloud pass (the browser D3D8
// adapter deliberately reports a fixed-function Voodoo5-class device, so
// W3DShaderManager selects this fallback rather than the ps.1.1
// terrainnoise*.pso path). That pass — and the single-pass
// ST_TERRAIN_BASE_NOISE12 variant — is identified by:
//   * a texture sampled with D3DTSS_TCI_CAMERASPACEPOSITION generated coords
//     plus a D3DTS_TEXTURE0/1 texture transform (the STRETCH_FACTOR + sliding
//     offset projection from updateNoise1/updateNoise2), and
//   * a multiplicative framebuffer blend: SRCBLEND=DESTCOLOR, DESTBLEND=ZERO.
// See GeneralsMD/Code/GameEngineDevice/Source/W3DDevice/GameClient/
// W3DShaderManager.cpp (TerrainShader2Stage::set, pass 2).
//
// This diagnostic is pure instrumentation (no rendering change): it lets the
// real-GPU harness confirm the detail layer is actually being emitted. A flat
// terrain almost always means the engine LOD / Options gate left
// m_useLightMap / m_useCloudMap off, so ST_TERRAIN_BASE_NOISE* is never
// selected and these draws never occur (counter stays 0) — not a lost pass in
// the D3D8 -> WebGL2 bridge, which faithfully replays each pass.
function d3d8NoteTerrainNoiseMultiplyDraw(
  renderState,
  canSampleTexture0,
  texture0Coordinates,
  texture0Transform,
  canSampleTexture1,
  texture1Coordinates,
  texture1Transform,
) {
  if (!renderState || Number(renderState.alphaBlendEnable ?? 0) === 0) {
    return;
  }
  const srcBlend = Number(renderState.srcBlend ?? D3DBLEND_ONE) >>> 0;
  const destBlend = Number(renderState.destBlend ?? D3DBLEND_ZERO) >>> 0;
  // The multiplicative "modulate onto framebuffer" blend that the noise/cloud
  // pass uses. This is what darkens/tints the terrain by the noise pattern.
  if (srcBlend !== D3DBLEND_DESTCOLOR || destBlend !== D3DBLEND_ZERO) {
    return;
  }
  const stage0IsProjectedNoise = Boolean(
    canSampleTexture0 &&
    texture0Coordinates &&
    texture0Coordinates.mode === D3DTSS_TCI_CAMERASPACEPOSITION);
  const stage1IsProjectedNoise = Boolean(
    canSampleTexture1 &&
    texture1Coordinates &&
    texture1Coordinates.mode === D3DTSS_TCI_CAMERASPACEPOSITION);
  if (!stage0IsProjectedNoise && !stage1IsProjectedNoise) {
    return;
  }
  d3d8PerfStats.terrainNoiseMultiplyDraws += 1;
  // Whether the projection matrix is non-identity. An identity transform on a
  // camera-space-position noise pass would collapse the noise UVs and flatten
  // the detail, so the harness can use this to distinguish "detail present"
  // from "detail collapsed".
  const stage0Transformed = stage0IsProjectedNoise &&
    texture0Coordinates.transformApplied &&
    !isIdentityD3DMatrix(texture0Transform);
  const stage1Transformed = stage1IsProjectedNoise &&
    texture1Coordinates.transformApplied &&
    !isIdentityD3DMatrix(texture1Transform);
  if (stage0Transformed || stage1Transformed) {
    d3d8PerfStats.terrainNoiseMultiplyTransformedDraws += 1;
  } else {
    d3d8PerfStats.terrainNoiseMultiplyIdentityTransformDraws += 1;
  }
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
    stencilEnable: Number(renderState.stencilEnable ?? 0) >>> 0,
    stencilFail: Number(renderState.stencilFail ?? D3DSTENCILOP_KEEP) >>> 0,
    stencilZFail: Number(renderState.stencilZFail ?? D3DSTENCILOP_KEEP) >>> 0,
    stencilPass: Number(renderState.stencilPass ?? D3DSTENCILOP_KEEP) >>> 0,
    stencilFunc: Number(renderState.stencilFunc ?? D3DCMP_ALWAYS) >>> 0,
    stencilRef: Number(renderState.stencilRef ?? 0) >>> 0,
    stencilMask: Number(renderState.stencilMask ?? 0xffffffff) >>> 0,
    stencilWriteMask: Number(renderState.stencilWriteMask ?? 0xffffffff) >>> 0,
    fogEnable: Number(renderState.fogEnable ?? 0) >>> 0,
    fogColor: Number(renderState.fogColor ?? 0) >>> 0,
    fogStart: Number(renderState.fogStart ?? 0) >>> 0,
    fogEnd: Number(renderState.fogEnd ?? D3D_FLOAT_ONE_BITS) >>> 0,
    fogVertexMode: Number(renderState.fogVertexMode ?? D3DFOG_LINEAR) >>> 0,
    rangeFogEnable: Number(renderState.rangeFogEnable ?? 0) >>> 0,
    fillMode: Number(renderState.fillMode ?? D3DFILL_SOLID) >>> 0,
    zBias: Number(renderState.zBias ?? 0) >>> 0,
    shadeMode: Number(renderState.shadeMode ?? D3DSHADE_GOURAUD) >>> 0,
    lighting: Number(renderState.lighting ?? 1) >>> 0,
    specularEnable: Number(renderState.specularEnable ?? 0) >>> 0,
    normalizeNormals: Number(renderState.normalizeNormals ?? 0) >>> 0,
    localViewer: Number(renderState.localViewer ?? 1) >>> 0,
    ambient: Number(renderState.ambient ?? 0) >>> 0,
    colorVertex: Number(renderState.colorVertex ?? 1) >>> 0,
    diffuseMaterialSource: Number(renderState.diffuseMaterialSource ?? D3DMCS_COLOR1) >>> 0,
    specularMaterialSource: Number(renderState.specularMaterialSource ?? D3DMCS_COLOR2) >>> 0,
    ambientMaterialSource: Number(renderState.ambientMaterialSource ?? D3DMCS_MATERIAL) >>> 0,
    emissiveMaterialSource: Number(renderState.emissiveMaterialSource ?? D3DMCS_MATERIAL) >>> 0,
    clipping: Number(renderState.clipping ?? 1) >>> 0,
    clipPlaneEnable: Number(renderState.clipPlaneEnable ?? 0) >>> 0,
    pointSize: Number(renderState.pointSize ?? D3D_FLOAT_ONE_BITS) >>> 0,
    pointSizeMin: Number(renderState.pointSizeMin ?? 0) >>> 0,
    pointSizeMax: Number(renderState.pointSizeMax ?? 0x42800000) >>> 0,
    pointSpriteEnable: Number(renderState.pointSpriteEnable ?? 0) >>> 0,
    pointScaleEnable: Number(renderState.pointScaleEnable ?? 0) >>> 0,
    pointScaleA: Number(renderState.pointScaleA ?? D3D_FLOAT_ONE_BITS) >>> 0,
    pointScaleB: Number(renderState.pointScaleB ?? 0) >>> 0,
    pointScaleC: Number(renderState.pointScaleC ?? 0) >>> 0,
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

function d3dStencilOpToGl(stencilOp) {
  switch (Number(stencilOp) >>> 0) {
    case D3DSTENCILOP_ZERO:
      return gl.ZERO;
    case D3DSTENCILOP_REPLACE:
      return gl.REPLACE;
    case D3DSTENCILOP_INCRSAT:
      return gl.INCR;
    case D3DSTENCILOP_DECRSAT:
      return gl.DECR;
    case D3DSTENCILOP_INVERT:
      return gl.INVERT;
    case D3DSTENCILOP_INCR:
      return gl.INCR_WRAP;
    case D3DSTENCILOP_DECR:
      return gl.DECR_WRAP;
    case D3DSTENCILOP_KEEP:
    default:
      return gl.KEEP;
  }
}

function d3d8StencilValueMask() {
  if (!gl || !d3d8HasStencilBuffer) {
    return 0;
  }
  if (d3d8StencilValueMaskCache != null) {
    return d3d8StencilValueMaskCache;
  }
  const bits = Math.max(0, Math.min(32, Number(gl.getParameter(gl.STENCIL_BITS) ?? 0)));
  d3d8StencilValueMaskCache = bits >= 32
    ? 0xffffffff
    : ((2 ** bits) - 1) >>> 0;
  return d3d8StencilValueMaskCache;
}

function d3d8EffectiveStencilValue(value) {
  return (((Number(value ?? 0) >>> 0) & d3d8StencilValueMask()) >>> 0);
}

const D3D8_NORMALIZED_RENDER_STATE_OPTIONS = {
  invertCullWinding: false,
  normalized: true,
};

function applyD3D8RenderState(renderState, options = {}) {
  const state = options.normalized === true
    ? renderState
    : normalizeD3D8RenderState(renderState);
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
  const stencilAvailable = d3d8HasStencilBuffer;
  const stencilEnabled = stencilAvailable && state.stencilEnable !== 0;
  const stencilFunc = d3dCmpToGl(state.stencilFunc);
  const stencilFail = d3dStencilOpToGl(state.stencilFail);
  const stencilZFail = d3dStencilOpToGl(state.stencilZFail);
  const stencilPass = d3dStencilOpToGl(state.stencilPass);
  const stencilRef = d3d8EffectiveStencilValue(state.stencilRef);
  const stencilMask = d3d8EffectiveStencilValue(state.stencilMask);
  const stencilWriteMask = d3d8EffectiveStencilValue(state.stencilWriteMask);
  const fogStart = d3dDwordToFloat(state.fogStart);
  const fogEnd = d3dDwordToFloat(state.fogEnd);
  const fogEnabled = state.fogEnable !== 0 &&
    state.fogVertexMode === D3DFOG_LINEAR &&
    Number.isFinite(fogStart) &&
    Number.isFinite(fogEnd) &&
    fogEnd > fogStart;
  const fogColor = d3dColorToNormalizedRgba(state.fogColor).slice(0, 3);
  const depthBias = d3d8DepthBiasInfo(state.zBias);
  const alphaTestEnabled = state.alphaTestEnable !== 0;
  const alphaRef = (state.alphaRef & 0xff) / 255;
  const fogRangeEnabled = state.rangeFogEnable !== 0;
  const lightingEnabled = state.lighting !== 0;
  const normalizeNormalsEnabled = state.normalizeNormals !== 0;
  const localViewerEnabled = state.localViewer !== 0;
  const colorVertexEnabled = state.colorVertex !== 0;
  const sceneAmbient = d3dColorToNormalizedRgba(state.ambient);
  const colorMaskR = Boolean(state.colorWriteEnable & D3DCOLORWRITEENABLE_RED);
  const colorMaskG = Boolean(state.colorWriteEnable & D3DCOLORWRITEENABLE_GREEN);
  const colorMaskB = Boolean(state.colorWriteEnable & D3DCOLORWRITEENABLE_BLUE);
  const colorMaskA = Boolean(state.colorWriteEnable & D3DCOLORWRITEENABLE_ALPHA);

  if (d3d8RenderGlStateValueChanged("frontFace", gl.CCW)) {
    gl.frontFace(gl.CCW);
  }
  setD3D8TrackedCapability(gl.CULL_FACE, "cullEnabled", cullEnabled);
  if (cullEnabled && d3d8RenderGlStateValueChanged("cullFace", cullFace)) {
    gl.cullFace(cullFace);
  }

  setD3D8TrackedCapability(gl.DEPTH_TEST, "depthEnabled", depthEnabled);
  setD3D8DepthMask(state.zWriteEnable !== 0);
  if (d3d8RenderGlStateValueChanged("depthFunc", depthFunc)) {
    gl.depthFunc(depthFunc);
  }

  // Emulate D3D8 D3DRS_ZBIAS with a slope-scaled polygon offset (see
  // d3d8DepthBiasInfo). This is what pulls the terrain-tessellated projected
  // insignia/shadow/scorch decals cleanly in front of the plaza they sit on so
  // the whole decal wins the depth test instead of z-fighting/half-clipping.
  // Tracked so the offset is fully reset (disabled + 0,0) on the very next draw
  // that carries ZBIAS==0, mirroring the engine's set/reset-to-0 bracketing and
  // preventing any cross-draw bias leak.
  const polygonOffset = depthBias.polygonOffset;
  setD3D8TrackedCapability(gl.POLYGON_OFFSET_FILL, "polygonOffsetEnabled", polygonOffset.enabled);
  if (d3d8RenderGlStateTupleChanged(
    "polygonOffset", polygonOffset.factor, polygonOffset.units)) {
    gl.polygonOffset(polygonOffset.factor, polygonOffset.units);
  }

  setD3D8TrackedCapability(gl.BLEND, "blendEnabled", blendEnabled);
  if (d3d8RenderGlStateTupleChanged("blendFunc", srcBlend, destBlend)) {
    gl.blendFunc(srcBlend, destBlend);
  }
  if (d3d8RenderGlStateValueChanged("blendEquation", blendEquation)) {
    gl.blendEquation(blendEquation);
  }
  if (d3d8RenderGlStateTupleChanged(
    "colorMask", colorMaskR, colorMaskG, colorMaskB, colorMaskA)) {
    setD3D8ColorMask(colorMaskR, colorMaskG, colorMaskB, colorMaskA);
  }
  setD3D8TrackedCapability(gl.STENCIL_TEST, "stencilEnabled", stencilEnabled);
  if (stencilEnabled) {
    if (d3d8RenderGlStateTupleChanged("stencilFunc", stencilFunc, stencilRef, stencilMask)) {
      gl.stencilFunc(stencilFunc, stencilRef, stencilMask);
    }
    if (d3d8RenderGlStateTupleChanged("stencilOp", stencilFail, stencilZFail, stencilPass)) {
      gl.stencilOp(stencilFail, stencilZFail, stencilPass);
    }
    if (d3d8RenderGlStateValueChanged("stencilMask", stencilWriteMask)) {
      gl.stencilMask(stencilWriteMask);
    }
  } else {
    const resetStencilMask = d3d8EffectiveStencilValue(0xffffffff);
    if (d3d8RenderGlStateTupleChanged("stencilFunc", gl.ALWAYS, 0, resetStencilMask)) {
      gl.stencilFunc(gl.ALWAYS, 0, resetStencilMask);
    }
    if (d3d8RenderGlStateTupleChanged("stencilOp", gl.KEEP, gl.KEEP, gl.KEEP)) {
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    }
    if (d3d8RenderGlStateValueChanged("stencilMask", resetStencilMask)) {
      gl.stencilMask(resetStencilMask);
    }
  }

  if (d3d8DiagLevel !== "full") {
    return {
      depthBiasNdc: depthBias.ndc,
      alphaTestEnabled,
      alphaRef,
      fogEnabled,
      fogRangeEnabled,
      fogColor,
      fogStart,
      fogEnd,
      lightingEnabled,
      normalizeNormalsEnabled,
      localViewerEnabled,
      colorVertexEnabled,
      sceneAmbient,
    };
  }

  const colorMask = {
    r: colorMaskR,
    g: colorMaskG,
    b: colorMaskB,
    a: colorMaskA,
  };
  return {
    depthBiasNdc: depthBias.ndc,
    alphaTestEnabled,
    alphaRef,
    fogEnabled,
    fogRangeEnabled,
    fogColor,
    fogStart,
    fogEnd,
    lightingEnabled,
    normalizeNormalsEnabled,
    localViewerEnabled,
    colorVertexEnabled,
    sceneAmbient,
    d3d: state,
    cull: {
      enabled: cullEnabled,
      frontFace: gl.CCW,
      cullFace: cullEnabled ? cullFace : gl.BACK,
      invertWinding: Boolean(options.invertCullWinding),
    },
    depth: {
      enabled: depthEnabled,
      mask: state.zWriteEnable !== 0,
      func: depthFunc,
      bias: depthBias,
    },
    blend: {
      enabled: blendEnabled,
      src: srcBlend,
      dest: destBlend,
      equation: blendEquation,
    },
    stencil: {
      available: stencilAvailable,
      enabled: stencilEnabled,
      func: stencilFunc,
      fail: stencilFail,
      zFail: stencilZFail,
      pass: stencilPass,
      ref: stencilRef,
      mask: stencilMask,
      writeMask: stencilWriteMask,
      d3dRef: state.stencilRef,
      d3dMask: state.stencilMask,
      d3dWriteMask: state.stencilWriteMask,
    },
    alphaTest: {
      enabled: alphaTestEnabled,
      func: d3dCmpToGl(state.alphaFunc),
      ref: alphaRef,
    },
    fog: {
      enabled: fogEnabled,
      color: fogColor,
      start: fogStart,
      end: fogEnd,
      vertexMode: state.fogVertexMode,
      rangeEnabled: fogRangeEnabled,
    },
    fillMode: {
      mode: state.fillMode,
      name: d3dFillModeName(state.fillMode),
    },
    shadeMode: {
      mode: state.shadeMode,
      name: d3dShadeModeName(state.shadeMode),
      flat: state.shadeMode === D3DSHADE_FLAT,
      gouraud: state.shadeMode === D3DSHADE_GOURAUD,
      phongRequested: state.shadeMode === D3DSHADE_PHONG,
    },
    lighting: {
      enabled: lightingEnabled,
      normalizeNormals: {
        enabled: normalizeNormalsEnabled,
        value: state.normalizeNormals,
      },
      localViewer: {
        enabled: localViewerEnabled,
        value: state.localViewer,
      },
    },
    ambient: {
      color: state.ambient,
      rgba: sceneAmbient,
    },
    materialSources: {
      colorVertex: {
        enabled: colorVertexEnabled,
        value: state.colorVertex,
      },
      diffuse: {
        source: state.diffuseMaterialSource,
        name: d3dMaterialSourceName(state.diffuseMaterialSource),
      },
      specular: {
        source: state.specularMaterialSource,
        name: d3dMaterialSourceName(state.specularMaterialSource),
      },
      ambient: {
        source: state.ambientMaterialSource,
        name: d3dMaterialSourceName(state.ambientMaterialSource),
      },
      emissive: {
        source: state.emissiveMaterialSource,
        name: d3dMaterialSourceName(state.emissiveMaterialSource),
      },
    },
    colorWrite: colorMask,
  };
}

// Graphics diagnostics level. "full" (default) keeps every per-draw probe,
// texture sample, draw-history entry, and the two readPixels GPU syncs that the
// startup-vertical gates and regression smokes assert on. "lite" skips those
// harness-only costs on the hot path (readPixels flushes dominate render time)
// while still doing the real draw — for the human-playable page. Never change
// the default: existing gates depend on "full".
let d3d8DiagLevel = "full";
// null = follow diag level (full => timed, lite => untimed); boolean = forced.
let d3d8PerfTimingOverride = null;
let d3d8PerfCountersOverride = null;
function syncD3D8PerfTimingEnabled() {
  d3d8PerfTimingEnabled = d3d8PerfTimingOverride ?? (d3d8DiagLevel === "full");
}
function syncD3D8PerfCountersEnabled() {
  d3d8PerfCountersEnabled = d3d8PerfCountersOverride ?? (d3d8DiagLevel === "full");
}
let d3d8SceneDrawHistoryLimit = 256;
let d3d8AdjacentDrawBatchingEnabled = true;
let d3d8LiteVertexBufferMirrorsEnabled = false;
let d3d8BufferProducerTrackingEnabled = false;
let d3d8DrawProducerTrackingEnabled = false;
let d3d8BoundDrawDiagnosticsSetter = null;
let d3d8BoundDrawDiagnosticsEnabled = d3d8DiagLevel === "full";
function setD3D8BoundDrawDiagnostics(enabled) {
  d3d8BoundDrawDiagnosticsEnabled = !(enabled === false || enabled === 0 || enabled === "0");
  if (typeof d3d8BoundDrawDiagnosticsSetter === "function") {
    d3d8BoundDrawDiagnosticsSetter(d3d8BoundDrawDiagnosticsEnabled ? 1 : 0);
  }
  return d3d8BoundDrawDiagnosticsEnabled;
}
function applyD3D8BoundDrawDiagnosticsLevel() {
  // Buffer checksums and byte-range capture are regression evidence, not draw
  // inputs. Keep them in full diagnostics and off the human play hot path.
  return setD3D8BoundDrawDiagnostics(d3d8DiagLevel === "full");
}
function setD3D8BufferProducerTracking(enabled) {
  d3d8BufferProducerTrackingEnabled = enabled === true || enabled === 1 || enabled === "1";
  if (typeof globalThis !== "undefined") {
    globalThis.__cncD3D8BufferProducerTrackingEnabled = d3d8BufferProducerTrackingEnabled;
  }
  return d3d8BufferProducerTrackingEnabled;
}
function setD3D8DrawProducerTracking(enabled) {
  d3d8DrawProducerTrackingEnabled = enabled === true || enabled === 1 || enabled === "1";
  if (typeof globalThis !== "undefined") {
    globalThis.__cncD3D8DrawProducerTrackingEnabled = d3d8DrawProducerTrackingEnabled;
  }
  return d3d8DrawProducerTrackingEnabled;
}
try {
  const _params = new URLSearchParams(globalThis.location?.search || "");
  const _diag = _params.get("diag");
  if (_diag === "lite" || _diag === "full") d3d8DiagLevel = _diag;
  const _perfTiming = _params.get("perfTiming");
  if (_perfTiming === "1" || _perfTiming === "true") d3d8PerfTimingOverride = true;
  else if (_perfTiming === "0" || _perfTiming === "false") d3d8PerfTimingOverride = false;
  syncD3D8PerfTimingEnabled();
  const _perfCounters = _params.get("perfCounters");
  if (_perfCounters === "1" || _perfCounters === "true") d3d8PerfCountersOverride = true;
  else if (_perfCounters === "0" || _perfCounters === "false") d3d8PerfCountersOverride = false;
  syncD3D8PerfCountersEnabled();
  const _gpuTiming = _params.get("gpuTiming");
  d3d8GpuFrameTimingEnabled = _gpuTiming === "1" || _gpuTiming === "true";
  const _historyLimit = Number(_params.get("drawHistoryLimit"));
  if (Number.isFinite(_historyLimit) && _historyLimit > 0) {
    d3d8SceneDrawHistoryLimit = Math.min(8192, Math.max(1, Math.trunc(_historyLimit)));
  }
  const _batchAdjacent = _params.get("d3d8Batch");
  if (_batchAdjacent === "0" || _batchAdjacent === "false" || _batchAdjacent === "off") {
    d3d8AdjacentDrawBatchingEnabled = false;
  }
  const _liteVertexMirrors = _params.get("d3d8LiteVertexMirrors");
  if (_liteVertexMirrors === "1" || _liteVertexMirrors === "true" || _liteVertexMirrors === "on") {
    d3d8LiteVertexBufferMirrorsEnabled = true;
  }
  const _bufferProducers = _params.get("d3d8BufferProducers");
  if (_bufferProducers === "1" || _bufferProducers === "true" || _bufferProducers === "on") {
    d3d8BufferProducerTrackingEnabled = true;
  }
  const _drawProducers = _params.get("d3d8DrawProducers");
  if (_drawProducers === "1" || _drawProducers === "true" || _drawProducers === "on") {
    d3d8DrawProducerTrackingEnabled = true;
  }
} catch (_e) { /* no location (node context) */ }
setD3D8BufferProducerTracking(d3d8BufferProducerTrackingEnabled);
setD3D8DrawProducerTracking(d3d8DrawProducerTrackingEnabled);
if (typeof globalThis !== "undefined") {
  globalThis.__cncSetDiagLevel = (lvl) => {
    if (lvl === "lite" || lvl === "full") {
      flushD3D8PendingDrawBatch("setDiagLevel");
      if (d3d8DiagLevel !== lvl) {
        invalidateD3D8DrawStateCache();
      }
      d3d8DiagLevel = lvl;
      syncD3D8PerfTimingEnabled();
      syncD3D8PerfCountersEnabled();
      applyD3D8BoundDrawDiagnosticsLevel();
    }
    return d3d8DiagLevel;
  };
  globalThis.__cncSetD3D8PerfTiming = (enabled) => {
    d3d8PerfTimingOverride = enabled == null ? null : Boolean(enabled);
    syncD3D8PerfTimingEnabled();
    return d3d8PerfTimingEnabled;
  };
  globalThis.__cncSetD3D8PerfCounters = (enabled) => {
    d3d8PerfCountersOverride = enabled == null ? null : Boolean(enabled);
    syncD3D8PerfCountersEnabled();
    return d3d8PerfCountersEnabled;
  };
  globalThis.__cncSetD3D8GpuFrameTiming = (enabled) => {
    const nextEnabled = enabled === true || enabled === 1 || enabled === "1";
    if (!nextEnabled) {
      endD3D8GpuFrameTimer();
      pollD3D8GpuFrameTimers();
    }
    d3d8GpuFrameTimingEnabled = nextEnabled && Boolean(d3d8GpuTimerExtension);
    return d3d8GpuFrameTimingEnabled;
  };
  globalThis.__cncSetD3D8SceneDrawHistoryLimit = (limit) => {
    const numericLimit = Number(limit);
    if (Number.isFinite(numericLimit) && numericLimit > 0) {
      d3d8SceneDrawHistoryLimit = Math.min(8192, Math.max(1, Math.trunc(numericLimit)));
    }
    return d3d8SceneDrawHistoryLimit;
  };
  globalThis.__cncClearD3D8SceneDrawHistory = () => {
    flushD3D8PendingDrawBatch("clearSceneDrawHistory");
    harnessState.graphics = {
      ...harnessState.graphics,
      d3d8DrawHistory: [],
      d3d8SceneDrawHistory: [],
    };
    return true;
  };
  globalThis.__cncD3D8PerfSummary = () => {
    flushD3D8PendingDrawBatch("perfSummary");
    return d3d8PerfSummary();
  };
  // Recent harness log entries (incl. wasm stdout/stderr) for probes chasing
  // shim-side messages like SM1 shader create/assemble failures.
  globalThis.__cncHarnessLogTail = (count = 100) =>
    harnessState.logs.slice(-Math.max(1, Math.min(500, Number(count) || 100)));
  // Pixel-sample a live texture's center texel (fidelity debugging: "is the
  // cloud texture the shader binds actually a cloud, or a white fallback?").
  globalThis.__cncSampleTextureCenter = (textureId) => sampleD3D8TextureCenter(textureId);
  // Blit a live texture (incl. compressed formats FBO-attach can't read) into
  // an RGBA scratch target and return an NxN grid + channel stats.
  globalThis.__cncBlitTexture = (textureId, grid = 8) => {
    const resource = d3d8Textures.get(Number(textureId) >>> 0);
    if (!gl || !resource?.texture) {
      return null;
    }
    flushD3D8PendingDrawBatch("blitTexture");
    const size = 64;
    const vs = "#version 300 es\nvoid main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.0-1.0,0,1);}";
    const fs = "#version 300 es\nprecision highp float;uniform sampler2D uT;out vec4 o;" +
      "void main(){o=textureLod(uT, gl_FragCoord.xy/64.0, 0.0);}";
    const compileBlit = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return shader;
    };
    const program = gl.createProgram();
    gl.attachShader(program, compileBlit(gl.VERTEX_SHADER, vs));
    gl.attachShader(program, compileBlit(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      return { error: info };
    }
    const previousProgram = gl.getParameter(gl.CURRENT_PROGRAM);
    const previousFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    const previousActive = gl.getParameter(gl.ACTIVE_TEXTURE);
    const previousViewport = gl.getParameter(gl.VIEWPORT);
    const target = gl.createTexture();
    gl.activeTexture(gl.TEXTURE15);
    gl.bindTexture(gl.TEXTURE_2D, target);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0 + 14);
    gl.bindTexture(gl.TEXTURE_2D, resource.texture);
    gl.uniform1i(gl.getUniformLocation(program, "uT"), 14);
    gl.viewport(0, 0, size, size);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const pixels = new Uint8Array(size * size * 4);
    gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    // restore
    gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);
    gl.useProgram(previousProgram);
    gl.activeTexture(gl.TEXTURE0 + 14);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(previousActive);
    gl.viewport(previousViewport[0], previousViewport[1], previousViewport[2], previousViewport[3]);
    gl.deleteFramebuffer(framebuffer);
    gl.deleteTexture(target);
    gl.deleteProgram(program);
    // The draw-state caches now disagree with real GL state; force reapply.
    harnessState.graphics.lastD3D8AppliedRenderState = null;
    let min = 255; let max = 0; let sum = 0;
    const gridValues = [];
    const step = Math.max(1, Math.floor(size / grid));
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const v = pixels[(y * size + x) * 4];
        min = Math.min(min, v); max = Math.max(max, v); sum += v;
      }
    }
    for (let gy = 0; gy < grid; gy += 1) {
      const row = [];
      for (let gx = 0; gx < grid; gx += 1) {
        row.push(pixels[((gy * step) * size + gx * step) * 4]);
      }
      gridValues.push(row);
    }
    return { min, max, mean: Math.round(sum / (size * size)), grid: gridValues,
      width: resource.width, height: resource.height };
  };
  globalThis.__cncSetD3D8AdjacentBatching = (enabled) => {
    flushD3D8PendingDrawBatch("setAdjacentBatching");
    d3d8AdjacentDrawBatchingEnabled = !(enabled === false || enabled === 0 || enabled === "0");
    return d3d8AdjacentDrawBatchingEnabled;
  };
  globalThis.__cncGetD3D8AdjacentBatching = () => d3d8AdjacentDrawBatchingEnabled;
  globalThis.__cncSetD3D8LiteVertexMirrors = (enabled) => {
    d3d8LiteVertexBufferMirrorsEnabled = enabled === true || enabled === 1 || enabled === "1";
    return d3d8LiteVertexBufferMirrorsEnabled;
  };
  globalThis.__cncGetD3D8LiteVertexMirrors = () => d3d8LiteVertexBufferMirrorsEnabled;
  globalThis.__cncSetD3D8BufferProducerTracking = setD3D8BufferProducerTracking;
  globalThis.__cncGetD3D8BufferProducerTracking = () => d3d8BufferProducerTrackingEnabled;
  globalThis.__cncSetD3D8DrawProducerTracking = setD3D8DrawProducerTracking;
  globalThis.__cncGetD3D8DrawProducerTracking = () => d3d8DrawProducerTrackingEnabled;
  globalThis.__cncSetD3D8BoundDrawDiagnostics = setD3D8BoundDrawDiagnostics;
  globalThis.__cncGetD3D8BoundDrawDiagnostics = () => d3d8BoundDrawDiagnosticsEnabled;
  globalThis.__cncFlushD3D8PendingDrawBatch = () => flushD3D8PendingDrawBatch("manual");
}

let d3d8PendingDrawBatch = null;

function d3d8AdjacentDrawBatchingActive() {
  return Boolean(gl && d3d8AdjacentDrawBatchingEnabled && d3d8DiagLevel !== "full");
}

function d3d8AdjacentDrawBatchInfo({
  stateHash,
  derivedStateHash,
  primitiveType,
  baseGlPrimitive,
  vertexBufferId,
  indexBufferId,
  vertexByteOffset,
  vertexStride,
  vertexShaderFvf,
  vertexByteSize,
  indexByteSize,
  indexSize,
  indexByteOffset,
  indexCount,
  usePersistentBuffers,
  fillMode,
  shadeMode,
}) {
  if (!d3d8AdjacentDrawBatchingActive()) {
    return null;
  }
  const safeFillMode = Number(fillMode ?? D3DFILL_SOLID) >>> 0;
  const safeShadeMode = Number(shadeMode ?? D3DSHADE_GOURAUD) >>> 0;
  if (safeFillMode !== D3DFILL_SOLID || safeShadeMode !== D3DSHADE_GOURAUD) {
    return null;
  }
  if ((Number(primitiveType ?? 0) >>> 0) !== D3DPT_TRIANGLELIST || baseGlPrimitive !== gl.TRIANGLES) {
    return null;
  }
  const safeDerivedStateHash = Number(derivedStateHash ?? 0);
  if ((Number(stateHash ?? 0) >>> 0) === 0 ||
      !Number.isSafeInteger(safeDerivedStateHash) || safeDerivedStateHash === 0) {
    return null;
  }
  if (!usePersistentBuffers ||
      vertexBufferId === 0 || indexBufferId === 0 || vertexStride < 12 ||
      indexCount === 0 || (indexCount % 3) !== 0 ||
      !(indexSize === 2 || indexSize === 4) ||
      vertexByteSize === 0 || indexByteSize === 0) {
    return null;
  }
  const texture0Id = Number(d3d8BoundTextures.get(0) ?? 0) >>> 0;
  const texture1Id = Number(d3d8BoundTextures.get(1) ?? 0) >>> 0;
  const indexEndByteOffset = indexByteOffset + indexCount * indexSize;
  if (!Number.isSafeInteger(indexEndByteOffset)) {
    return null;
  }
  return {
    stateHash: Number(stateHash) >>> 0,
    derivedStateHash: safeDerivedStateHash,
    primitiveType: Number(primitiveType) >>> 0,
    vertexBufferId,
    indexBufferId,
    vertexByteOffset,
    vertexStride,
    vertexShaderFvf,
    texture0Id,
    texture1Id,
    glPrimitive: baseGlPrimitive,
    indexType: indexSize === 4 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
    indexSize,
    indexByteOffset,
    indexCount,
    nextIndexByteOffset: indexEndByteOffset,
  };
}

function d3d8AdjacentDrawBatchKeyMatches(left, right) {
  return Boolean(left && right &&
    left.stateHash === right.stateHash &&
    left.derivedStateHash === right.derivedStateHash &&
    left.primitiveType === right.primitiveType &&
    left.vertexBufferId === right.vertexBufferId &&
    left.indexBufferId === right.indexBufferId &&
    left.vertexByteOffset === right.vertexByteOffset &&
    left.vertexStride === right.vertexStride &&
    left.vertexShaderFvf === right.vertexShaderFvf &&
    left.indexSize === right.indexSize &&
    left.texture0Id === right.texture0Id &&
    left.texture1Id === right.texture1Id);
}

function tryMergeD3D8PendingDrawBatch(batchInfo) {
  const pending = d3d8PendingDrawBatch;
  if (!d3d8AdjacentDrawBatchKeyMatches(pending, batchInfo) ||
      pending.nextIndexByteOffset !== batchInfo.indexByteOffset) {
    return false;
  }
  pending.indexCount += batchInfo.indexCount;
  pending.nextIndexByteOffset = batchInfo.nextIndexByteOffset;
  pending.logicalDraws += 1;
  if (d3d8PerfCountersEnabled) d3d8PerfStats.drawBatchCandidates += 1;
  if (d3d8PerfCountersEnabled) d3d8PerfStats.drawBatchMerged += 1;
  if (d3d8PerfCountersEnabled) d3d8PerfStats.drawBatchSavedDrawElements += 1;
  if (d3d8PerfCountersEnabled) d3d8PerfStats.drawBatchMergedIndices += batchInfo.indexCount;
  if (d3d8PerfCountersEnabled) {
    d3d8PerfStats.drawBatchMaxRunLength = Math.max(
      d3d8PerfStats.drawBatchMaxRunLength,
      pending.logicalDraws,
    );
  }
  return true;
}

function queueD3D8PendingDrawBatch(batchInfo) {
  if (!batchInfo) {
    return false;
  }
  d3d8PendingDrawBatch = {
    ...batchInfo,
    logicalDraws: 1,
  };
  if (d3d8PerfCountersEnabled) d3d8PerfStats.drawBatchCandidates += 1;
  if (d3d8PerfCountersEnabled) d3d8PerfStats.drawBatchQueued += 1;
  if (d3d8PerfCountersEnabled) {
    d3d8PerfStats.drawBatchMaxRunLength = Math.max(d3d8PerfStats.drawBatchMaxRunLength, 1);
  }
  return true;
}

function flushD3D8PendingDrawBatch(reason = "flush") {
  const pending = d3d8PendingDrawBatch;
  if (!pending || !gl) {
    d3d8PendingDrawBatch = null;
    return 0;
  }
  d3d8PendingDrawBatch = null;
  const drawStartedAt = perfNow();
  gl.drawElements(
    pending.glPrimitive,
    pending.indexCount,
    pending.indexType,
    pending.indexByteOffset,
  );
  if (d3d8PerfCountersEnabled) d3d8PerfStats.draws += 1;
  if (d3d8PerfCountersEnabled) d3d8PerfStats.drawElements += 1;
  if (d3d8PerfCountersEnabled) d3d8PerfStats.drawIndices += Number(pending.indexCount ?? 0) >>> 0;
  if (d3d8PerfCountersEnabled) d3d8PerfStats.drawMs += perfNow() - drawStartedAt;
  if (d3d8PerfCountersEnabled) {
    d3d8PerfStats.drawBatchFlushes += 1;
    const reasonName = String(reason || "flush");
    d3d8DrawBatchFlushReasons.set(
      reasonName,
      (d3d8DrawBatchFlushReasons.get(reasonName) ?? 0) + 1,
    );
  }
  return 1;
}

function applyD3D8DefaultVertexAttribValues(
  bridgeProgram,
  vertexLayout,
  canSampleTexture0,
  texture0Coordinates,
  canSampleTexture1,
  texture1Coordinates,
) {
  const defaultKey = [
    bridgeProgram.normal,
    vertexLayout.normalOffset === null ? 1 : 0,
    bridgeProgram.diffuse,
    vertexLayout.diffuseOffset === null ? 1 : 0,
    bridgeProgram.specular,
    vertexLayout.specularOffset === null ? 1 : 0,
    bridgeProgram.texCoord0,
    !(canSampleTexture0 && texture0Coordinates.usesVertexTexCoord && texture0Coordinates.offset !== null) ? 1 : 0,
    bridgeProgram.texCoord1,
    !(canSampleTexture1 && texture1Coordinates.usesVertexTexCoord && texture1Coordinates.offset !== null) ? 1 : 0,
  ].join(",");
  if (defaultKey === d3d8LastDefaultVertexAttribKey) {
    return;
  }
  if (bridgeProgram.normal >= 0 && vertexLayout.normalOffset === null) {
    gl.vertexAttrib3f(bridgeProgram.normal, 0, 0, 1);
  }
  if (bridgeProgram.diffuse >= 0 && vertexLayout.diffuseOffset === null) {
    gl.vertexAttrib4f(bridgeProgram.diffuse, 1, 1, 1, 1);
  }
  if (bridgeProgram.specular >= 0 && vertexLayout.specularOffset === null) {
    gl.vertexAttrib4f(bridgeProgram.specular, 0, 0, 0, 1);
  }
  if (bridgeProgram.texCoord0 >= 0 &&
      !(canSampleTexture0 && texture0Coordinates.usesVertexTexCoord && texture0Coordinates.offset !== null)) {
    gl.vertexAttrib2f(bridgeProgram.texCoord0, 0, 0);
  }
  if (bridgeProgram.texCoord1 >= 0 &&
      !(canSampleTexture1 && texture1Coordinates.usesVertexTexCoord && texture1Coordinates.offset !== null)) {
    gl.vertexAttrib2f(bridgeProgram.texCoord1, 0, 0);
  }
  d3d8LastDefaultVertexAttribKey = defaultKey;
}

function configureD3D8VertexAttribPointers({
  bridgeProgram,
  vertexResource,
  vertexByteOffset,
  vertexStride,
  vertexLayout,
  canSampleTexture0,
  texture0Coordinates,
  canSampleTexture1,
  texture1Coordinates,
}) {
  bindD3D8ArrayBuffer(vertexResource.buffer);
  const positionComponents = vertexLayout?.pretransformed ? 4 : 3;
  gl.enableVertexAttribArray(bridgeProgram.position);
  gl.vertexAttribPointer(bridgeProgram.position, positionComponents, gl.FLOAT, false, vertexStride, vertexByteOffset);
  if (bridgeProgram.normal >= 0 && vertexLayout.normalOffset !== null) {
    gl.enableVertexAttribArray(bridgeProgram.normal);
    gl.vertexAttribPointer(bridgeProgram.normal, 3, gl.FLOAT, false,
      vertexStride, vertexByteOffset + vertexLayout.normalOffset);
  } else if (bridgeProgram.normal >= 0) {
    gl.disableVertexAttribArray(bridgeProgram.normal);
  }
  if (bridgeProgram.diffuse >= 0 && vertexLayout.diffuseOffset !== null) {
    gl.enableVertexAttribArray(bridgeProgram.diffuse);
    gl.vertexAttribPointer(bridgeProgram.diffuse, 4, gl.UNSIGNED_BYTE, true,
      vertexStride, vertexByteOffset + vertexLayout.diffuseOffset);
  } else if (bridgeProgram.diffuse >= 0) {
    gl.disableVertexAttribArray(bridgeProgram.diffuse);
  }
  if (bridgeProgram.specular >= 0 && vertexLayout.specularOffset !== null) {
    gl.enableVertexAttribArray(bridgeProgram.specular);
    gl.vertexAttribPointer(bridgeProgram.specular, 4, gl.UNSIGNED_BYTE, true,
      vertexStride, vertexByteOffset + vertexLayout.specularOffset);
  } else if (bridgeProgram.specular >= 0) {
    gl.disableVertexAttribArray(bridgeProgram.specular);
  }
  if (bridgeProgram.texCoord0 >= 0 && canSampleTexture0 &&
      texture0Coordinates.usesVertexTexCoord && texture0Coordinates.offset !== null) {
    gl.enableVertexAttribArray(bridgeProgram.texCoord0);
    gl.vertexAttribPointer(bridgeProgram.texCoord0, 2, gl.FLOAT, false,
      vertexStride, vertexByteOffset + texture0Coordinates.offset);
  } else if (bridgeProgram.texCoord0 >= 0) {
    gl.disableVertexAttribArray(bridgeProgram.texCoord0);
  }
  if (bridgeProgram.texCoord1 >= 0 && canSampleTexture1 &&
      texture1Coordinates.usesVertexTexCoord && texture1Coordinates.offset !== null) {
    gl.enableVertexAttribArray(bridgeProgram.texCoord1);
    gl.vertexAttribPointer(bridgeProgram.texCoord1, 2, gl.FLOAT, false,
      vertexStride, vertexByteOffset + texture1Coordinates.offset);
  } else if (bridgeProgram.texCoord1 >= 0) {
    gl.disableVertexAttribArray(bridgeProgram.texCoord1);
  }
  applyD3D8DefaultVertexAttribValues(
    bridgeProgram,
    vertexLayout,
    canSampleTexture0,
    texture0Coordinates,
    canSampleTexture1,
    texture1Coordinates,
  );
}

function rememberD3D8VertexArray(key, indexBufferId, vertexArray, elementArrayBuffer) {
  if (!key || !vertexArray) {
    return null;
  }
  const bucket = d3d8VertexArrayCacheBucket(key.vertexBufferId, indexBufferId, true);
  for (const entry of bucket) {
    if (d3d8VertexArrayKeyMatches(entry, key, indexBufferId)) {
      if (entry.vertexArray !== vertexArray) {
        deleteD3D8VertexArrayCacheEntry(entry);
      }
      entry.vertexArray = vertexArray;
      entry.elementArrayBuffer = elementArrayBuffer;
      touchD3D8VertexArrayCacheEntry(entry);
      return entry;
    }
  }
  const entry = cloneD3D8VertexAttribKey(key);
  entry.indexBufferId = indexBufferId;
  entry.vertexArray = vertexArray;
  entry.elementArrayBuffer = elementArrayBuffer;
  entry.lruPrevious = null;
  entry.lruNext = null;
  bucket.push(entry);
  touchD3D8VertexArrayCacheEntry(entry);
  d3d8VertexArrayCacheEntries += 1;
  d3d8VertexArrayCachePeakEntries = Math.max(
    d3d8VertexArrayCachePeakEntries,
    d3d8VertexArrayCacheEntries,
  );
  while (d3d8VertexArrayCacheEntries > D3D8_VERTEX_ARRAY_CACHE_LIMIT) {
    evictOldestD3D8VertexArrayCacheEntry();
  }
  return entry;
}

function copyD3D8RenderStateFromWasm(ptr) {
  const heap = getHeapU32();
  const address = Number(ptr ?? 0) >>> 0;
  const renderStateSlots = 50;
  const textureStageCount = 8;
  const textureStageStateSlots = 29;
  const offset = address >>> 2;
  if (address === 0 || !(heap instanceof Uint32Array) ||
      offset + renderStateSlots + textureStageCount * textureStageStateSlots > heap.length) {
    return null;
  }
  const readState = (slot) => heap[offset + slot] >>> 0;
  const textureStages = [];
  for (let stage = 0; stage < textureStageCount; stage += 1) {
    const stageOffset = offset + renderStateSlots + stage * textureStageStateSlots;
    const read = (slot) => heap[stageOffset + slot] >>> 0;
    textureStages.push({
      stage,
      colorOp: read(1),
      colorArg1: read(2),
      colorArg2: read(3),
      alphaOp: read(4),
      alphaArg1: read(5),
      alphaArg2: read(6),
      bumpEnvMat00: read(7),
      bumpEnvMat01: read(8),
      bumpEnvMat10: read(9),
      bumpEnvMat11: read(10),
      texCoordIndex: read(11),
      addressU: read(13),
      addressV: read(14),
      borderColor: read(15),
      magFilter: read(16),
      minFilter: read(17),
      mipFilter: read(18),
      mipMapLodBias: read(19),
      maxMipLevel: read(20),
      maxAnisotropy: read(21),
      bumpEnvLScale: read(22),
      bumpEnvLOffset: read(23),
      textureTransformFlags: read(24),
      addressW: read(25),
      colorArg0: read(26),
      alphaArg0: read(27),
      resultArg: read(28),
    });
  }
  return {
    cullMode: readState(0),
    zEnable: readState(1),
    zWriteEnable: readState(2),
    zFunc: readState(3),
    alphaBlendEnable: readState(4),
    srcBlend: readState(5),
    destBlend: readState(6),
    blendOp: readState(7),
    alphaTestEnable: readState(8),
    alphaFunc: readState(9),
    alphaRef: readState(10),
    colorWriteEnable: readState(11),
    textureFactor: readState(12),
    stencilEnable: readState(13),
    stencilFail: readState(14),
    stencilZFail: readState(15),
    stencilPass: readState(16),
    stencilFunc: readState(17),
    stencilRef: readState(18),
    stencilMask: readState(19),
    stencilWriteMask: readState(20),
    fogEnable: readState(21),
    fogColor: readState(22),
    fogStart: readState(23),
    fogEnd: readState(24),
    fogVertexMode: readState(25),
    rangeFogEnable: readState(26),
    fillMode: readState(27),
    zBias: readState(28),
    shadeMode: readState(29),
    lighting: readState(30),
    ambient: readState(31),
    colorVertex: readState(32),
    diffuseMaterialSource: readState(33),
    specularMaterialSource: readState(34),
    ambientMaterialSource: readState(35),
    emissiveMaterialSource: readState(36),
    clipping: readState(37),
    clipPlaneEnable: readState(38),
    specularEnable: readState(39),
    normalizeNormals: readState(40),
    localViewer: readState(41),
    pointSize: readState(42),
    pointSizeMin: readState(43),
    pointSizeMax: readState(44),
    pointSpriteEnable: readState(45),
    pointScaleEnable: readState(46),
    pointScaleA: readState(47),
    pointScaleB: readState(48),
    pointScaleC: readState(49),
    textureStages,
  };
}

function copyD3D8ClipPlanesFromWasm(ptr) {
  const heap = getHeapF32();
  const address = Number(ptr ?? 0) >>> 0;
  const offset = address >>> 2;
  if (address === 0 || !(heap instanceof Float32Array) || offset + 24 > heap.length) {
    return null;
  }
  return Array.from({ length: 6 }, (_, index) => {
    const base = offset + index * 4;
    return [heap[base], heap[base + 1], heap[base + 2], heap[base + 3]];
  });
}

function copyD3D8LightsFromWasm(ptr) {
  const heapU32 = getHeapU32();
  const heapF32 = getHeapF32();
  const address = Number(ptr ?? 0) >>> 0;
  const offset = address >>> 2;
  const lightStrideSlots = 27;
  if (address === 0 || !(heapU32 instanceof Uint32Array) || !(heapF32 instanceof Float32Array) ||
      offset + D3D8_LIGHT_COUNT * lightStrideSlots > heapU32.length) {
    return null;
  }
  const color = (base) => [heapF32[base], heapF32[base + 1], heapF32[base + 2], heapF32[base + 3]];
  const vector = (base) => [heapF32[base], heapF32[base + 1], heapF32[base + 2]];
  return Array.from({ length: D3D8_LIGHT_COUNT }, (_, index) => {
    const base = offset + index * lightStrideSlots;
    return {
      index,
      type: heapU32[base] >>> 0,
      enabled: (heapU32[base + 1] >>> 0) !== 0,
      diffuse: color(base + 2),
      specular: color(base + 6),
      ambient: color(base + 10),
      position: vector(base + 14),
      direction: vector(base + 17),
      range: heapF32[base + 20],
      falloff: heapF32[base + 21],
      attenuation0: heapF32[base + 22],
      attenuation1: heapF32[base + 23],
      attenuation2: heapF32[base + 24],
      theta: heapF32[base + 25],
      phi: heapF32[base + 26],
    };
  });
}

function copyD3D8MaterialFromWasm(ptr) {
  const heap = getHeapF32();
  const address = Number(ptr ?? 0) >>> 0;
  const offset = address >>> 2;
  if (address === 0 || !(heap instanceof Float32Array) || offset + 17 > heap.length) {
    return null;
  }
  const color = (base) => [heap[offset + base], heap[offset + base + 1],
    heap[offset + base + 2], heap[offset + base + 3]];
  return {
    diffuse: color(0),
    ambient: color(4),
    specular: color(8),
    emissive: color(12),
    power: heap[offset + 16],
  };
}

function d3d8WasmFloatView(ptr, floatCount) {
  const heap = getHeapF32();
  const address = Number(ptr ?? 0) >>> 0;
  const offset = address >>> 2;
  if (address === 0 || !(heap instanceof Float32Array) || offset + floatCount > heap.length) {
    return null;
  }
  return heap.subarray(offset, offset + floatCount);
}

function materializeD3D8DrawPayload(payload = {}) {
  if (payload.statePayloadPointers !== true) {
    return payload;
  }
  const requiredCopy = (value, label) => {
    if (value === null) {
      throw new Error(`cannot materialize D3D8 draw ${label} from wasm memory`);
    }
    return value;
  };
  const matrixCopy = (pointer, label, required = false) => {
    const address = Number(pointer ?? 0) >>> 0;
    if (address === 0) {
      if (required) {
        throw new Error(`cannot materialize D3D8 draw ${label}: missing pointer`);
      }
      return null;
    }
    const matrix = normalizeD3DMatrix(address);
    return Array.from(requiredCopy(matrix, label));
  };
  const transformMask = Number(payload.transformMask ?? 0) >>> 0;
  const pixelShaderHandle = Number(payload.pixelShaderHandle ?? 0) >>> 0;
  const vertexShaderFvf = Number(payload.vertexShaderFvf ?? 0) >>> 0;
  const sm1VertexDraw = (vertexShaderFvf & 0x80000000) !== 0;
  const psConstants = pixelShaderHandle !== 0
    ? requiredCopy(d3d8WasmFloatView(payload.psConstantsPtr, 8 * 4), "pixel shader constants")
    : null;
  const vsConstants = sm1VertexDraw
    ? requiredCopy(d3d8WasmFloatView(payload.vsConstantsPtr, 96 * 4), "vertex shader constants")
    : null;
  const treeShroud = payload.treeShroud
    ? {
        c32: Array.from(payload.treeShroud.c32 ?? []),
        c33: Array.from(payload.treeShroud.c33 ?? []),
      }
    : null;
  return {
    ...payload,
    __reusedD3D8DrawPayload: false,
    statePayloadPointers: false,
    statePayloadCanonical: true,
    transforms: {
      world: matrixCopy(payload.transforms?.world, "world transform", (transformMask & 1) !== 0),
      view: matrixCopy(payload.transforms?.view, "view transform", (transformMask & 2) !== 0),
      projection: matrixCopy(payload.transforms?.projection, "projection transform",
        (transformMask & 4) !== 0),
      texture0: matrixCopy(payload.transforms?.texture0, "texture0 transform"),
      texture1: matrixCopy(payload.transforms?.texture1, "texture1 transform"),
      texture2: matrixCopy(payload.transforms?.texture2, "texture2 transform"),
      texture3: matrixCopy(payload.transforms?.texture3, "texture3 transform"),
    },
    renderState: requiredCopy(
      copyD3D8RenderStateFromWasm(payload.renderStatePtr),
      "render state",
    ),
    clipPlanes: requiredCopy(
      copyD3D8ClipPlanesFromWasm(payload.clipPlanesPtr),
      "clip planes",
    ),
    lights: requiredCopy(copyD3D8LightsFromWasm(payload.lightsPtr), "lights"),
    material: requiredCopy(copyD3D8MaterialFromWasm(payload.materialPtr), "material"),
    psConstants: psConstants ? Array.from(psConstants) : null,
    vsConstants: vsConstants ? Array.from(vsConstants) : null,
    treeShroud,
  };
}

function pollD3D8GpuFrameTimers() {
  if (!gl || !d3d8GpuTimerExtension) {
    return;
  }
  while (d3d8GpuFramePendingQueries.length > 0) {
    const query = d3d8GpuFramePendingQueries[0];
    if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
      break;
    }
    d3d8GpuFramePendingQueries.shift();
    const disjoint = Boolean(gl.getParameter(d3d8GpuTimerExtension.GPU_DISJOINT_EXT));
    if (disjoint) {
      d3d8GpuFrameDisjointSamples += 1;
    } else {
      const elapsedNs = Number(gl.getQueryParameter(query, gl.QUERY_RESULT));
      if (Number.isFinite(elapsedNs) && elapsedNs >= 0) {
        const elapsedMs = elapsedNs / 1_000_000;
        d3d8GpuFrameSamplesMs.push(elapsedMs);
        d3d8GpuFrameSampleTotalMs += elapsedMs;
      }
    }
    gl.deleteQuery(query);
  }
}

function beginD3D8GpuFrameTimer() {
  if (!gl || !d3d8GpuTimerExtension || !d3d8GpuFrameTimingEnabled || d3d8GpuFrameActiveQuery) {
    return;
  }
  const query = gl.createQuery();
  if (!query) {
    return;
  }
  gl.beginQuery(d3d8GpuTimerExtension.TIME_ELAPSED_EXT, query);
  d3d8GpuFrameActiveQuery = query;
}

function endD3D8GpuFrameTimer() {
  if (!gl || !d3d8GpuTimerExtension || !d3d8GpuFrameActiveQuery) {
    return;
  }
  gl.endQuery(d3d8GpuTimerExtension.TIME_ELAPSED_EXT);
  d3d8GpuFramePendingQueries.push(d3d8GpuFrameActiveQuery);
  d3d8GpuFrameActiveQuery = null;
}

function d3d8GpuFrameTimerSummary() {
  pollD3D8GpuFrameTimers();
  const sorted = [...d3d8GpuFrameSamplesMs].sort((left, right) => left - right);
  const percentile = (amount) => sorted.length > 0
    ? sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * amount))]
    : null;
  return {
    supported: Boolean(d3d8GpuTimerExtension),
    enabled: d3d8GpuFrameTimingEnabled,
    sampleCount: sorted.length,
    pendingCount: d3d8GpuFramePendingQueries.length,
    disjointSamples: d3d8GpuFrameDisjointSamples,
    totalMs: d3d8GpuFrameSampleTotalMs,
    minMs: sorted[0] ?? null,
    avgMs: sorted.length > 0 ? d3d8GpuFrameSampleTotalMs / sorted.length : null,
    p95Ms: percentile(0.95),
    p99Ms: percentile(0.99),
    maxMs: sorted[sorted.length - 1] ?? null,
    latestMs: d3d8GpuFrameSamplesMs[d3d8GpuFrameSamplesMs.length - 1] ?? null,
  };
}

function presentD3D8Frame() {
  flushD3D8PendingDrawBatch("present");
  drainD3D8BufferRetirements();
  return true;
}

function paintD3D8DrawIndexed(payload = {}) {
  const drawSequence = (Number(harnessState.graphics.d3d8DrawIndexedSequence ?? 0) >>> 0) + 1;
  const vertexByteSize = Number(payload.vertexBytes ?? 0) >>> 0;
  const indexByteSize = Number(payload.indexBytes ?? 0) >>> 0;
  const vertexBufferId = Number(payload.vertexBufferId ?? 0) >>> 0;
  const indexBufferId = Number(payload.indexBufferId ?? 0) >>> 0;
  const vertexByteOffset = Number(payload.vertexByteOffset ?? 0) >>> 0;
  const indexByteOffset = Number(payload.indexByteOffset ?? 0) >>> 0;
  const vertexStride = Number(payload.vertexStride ?? 0) >>> 0;
  const vertexShaderFvf = Number(payload.vertexShaderFvf ?? 0) >>> 0;
  // Programmable SM1 shader state: pixel-shader handle rides its own payload
  // field; a vertex-shader handle travels the vertexShaderFvf field with bit
  // 31 set (never valid in an FVF code). Both are folded into the native
  // derivedStateHash, so every downstream cache/batch key already separates
  // shader draws from fixed-function draws.
  const pixelShaderHandle = Number(payload.pixelShaderHandle ?? 0) >>> 0;
  const sm1VertexDraw = (vertexShaderFvf & 0x80000000) !== 0;
  const pointerStatePayload = payload.statePayloadPointers === true;
  if (pointerStatePayload) {
    payload.psConstants = pixelShaderHandle !== 0
      ? d3d8WasmFloatView(payload.psConstantsPtr, 8 * 4)
      : null;
    payload.vsConstants = sm1VertexDraw
      ? d3d8WasmFloatView(payload.vsConstantsPtr, 96 * 4)
      : null;
  }
  const vertexCount = Number(payload.vertexCount ?? 0) >>> 0;
  const indexSize = Number(payload.indexSize ?? 0) >>> 0;
  const indexCount = Number(payload.indexCount ?? 0) >>> 0;
  const primitiveType = Number(payload.primitiveType ?? 0) >>> 0;
  if (d3d8PerfCountersEnabled) d3d8PerfStats.drawPayloadCalls += 1;
  if (payload.__reusedD3D8DrawPayload === true) {
    if (d3d8PerfCountersEnabled) d3d8PerfStats.drawPayloadReused += 1;
  }
  const sortedDrawProfiled = payload.sortedDrawSubmitProfile === true;
  const drawProducer = d3d8DrawProducerTrackingEnabled ? bufferProducerLabel(payload.producer) : null;
  const drawProducerStartedAt = d3d8DrawProducerTrackingEnabled ? perfNow() : 0;
  const drawProducerEntry = d3d8DrawProducerTrackingEnabled
    ? noteD3D8DrawProducerCall(payload.producer, indexCount, sortedDrawProfiled)
    : null;
  const drawSubphaseProfiled = sortedDrawProfiled || drawProducerEntry !== null;
  const sortedDrawStartedAt = sortedDrawProfiled ? perfNow() : 0;
  const drawPhaseStartedAt = drawSubphaseProfiled ? perfNow() : 0;
  let drawPhaseStartedAtCurrent = drawPhaseStartedAt;
  let drawSubphaseStartedAtCurrent = drawPhaseStartedAt;
  const finishDrawProducerProfile = drawProducerEntry
    ? () => {
        noteD3D8DrawProducerMs(drawProducerEntry, "drawProfiledMs", perfNow() - drawProducerStartedAt);
      }
    : null;
  const finishSortedDrawProfile = sortedDrawProfiled
    ? () => {
        const elapsed = perfNow() - sortedDrawStartedAt;
        if (d3d8PerfCountersEnabled) d3d8PerfStats.sortedDrawProfiledMs += elapsed;
        noteD3D8DrawProducerMs(drawProducerEntry, "sortedDrawProfiledMs", elapsed);
      }
    : null;
  const recordDrawPhase = drawSubphaseProfiled
    ? (field) => {
        const now = perfNow();
        const elapsed = now - drawPhaseStartedAtCurrent;
        if (sortedDrawProfiled) {
          d3d8PerfStats[field] += elapsed;
        }
        noteD3D8DrawProducerPhaseMs(drawProducerEntry, field, elapsed, sortedDrawProfiled);
        drawPhaseStartedAtCurrent = now;
      }
    : null;
  const resetDrawSubphase = drawSubphaseProfiled
    ? () => {
        drawSubphaseStartedAtCurrent = perfNow();
      }
    : null;
  const recordDrawSubphase = drawSubphaseProfiled
    ? (field) => {
        const now = perfNow();
        const elapsed = now - drawSubphaseStartedAtCurrent;
        if (sortedDrawProfiled) {
          d3d8PerfStats[field] += elapsed;
        }
        noteD3D8DrawProducerPhaseMs(drawProducerEntry, field, elapsed, sortedDrawProfiled);
        drawSubphaseStartedAtCurrent = now;
      }
    : null;
  if (sortedDrawProfiled) {
    if (d3d8PerfCountersEnabled) d3d8PerfStats.sortedDrawProfiledCalls += 1;
  }
  const baseGlPrimitive = d3dPrimitiveToGl(primitiveType);
  const vertexResource = d3d8Buffers.get(d3d8BufferKey(1, vertexBufferId));
  const indexResource = d3d8Buffers.get(d3d8BufferKey(2, indexBufferId));
  const usePersistentBuffers = Boolean(vertexResource && indexResource);
  const stateHash = Number(payload.stateHash ?? 0) >>> 0;
  const derivedStateHash = Number(payload.derivedStateHash ?? payload.stateHash ?? 0);
  const earlyBatchInfo = d3d8AdjacentDrawBatchInfo({
    stateHash,
    derivedStateHash,
    primitiveType,
    baseGlPrimitive,
    vertexBufferId,
    indexBufferId,
    vertexByteOffset,
    vertexStride,
    vertexShaderFvf,
    vertexByteSize,
    indexByteSize,
    indexSize,
    indexByteOffset,
    indexCount,
    // Dynamic-redirected draws bind per-range pool buffers, so contiguity of
    // the original ring offsets says nothing about GL-buffer contiguity —
    // exclude them from adjacent batching (it merged ~0 such draws anyway).
    usePersistentBuffers: usePersistentBuffers &&
      vertexResource?.dynamic !== true &&
      indexResource?.dynamic !== true,
    fillMode: payload.renderStateFillMode ?? payload.renderState?.fillMode,
    shadeMode: payload.renderStateShadeMode ?? payload.renderState?.shadeMode,
  });
  if (tryMergeD3D8PendingDrawBatch(earlyBatchInfo)) {
    recordDrawPhase?.("sortedDrawPreBatchMs");
    finishSortedDrawProfile?.();
    finishDrawProducerProfile?.();
    harnessState.graphics.d3d8DrawIndexedSequence = drawSequence;
    return 1;
  }
  flushD3D8PendingDrawBatch("drawBreak");
  recordDrawPhase?.("sortedDrawPreBatchMs");
  const worldRevision = pointerStatePayload ? Number(payload.worldTransformRevision ?? 0) >>> 0 : 0;
  const viewRevision = pointerStatePayload ? Number(payload.viewTransformRevision ?? 0) >>> 0 : 0;
  const projectionRevision = pointerStatePayload
    ? Number(payload.projectionTransformRevision ?? 0) >>> 0
    : 0;
  const worldRevisionUnchanged = worldRevision !== 0 &&
    worldRevision === d3d8LastTransformSourceWorldRevision && d3d8LastTransformSourceWorld !== null;
  const viewRevisionUnchanged = viewRevision !== 0 &&
    viewRevision === d3d8LastTransformSourceViewRevision && d3d8LastTransformSourceView !== null;
  const projectionRevisionUnchanged = projectionRevision !== 0 &&
    projectionRevision === d3d8LastTransformSourceProjectionRevision &&
    d3d8LastTransformSourceProjection !== null;
  const world = worldRevisionUnchanged
    ? d3d8LastTransformSourceWorld
    : normalizeD3DMatrix(payload.transforms?.world, d3d8DrawMatrixScratch.world);
  const engineView = viewRevisionUnchanged
    ? d3d8LastTransformSourceView
    : normalizeD3DMatrix(payload.transforms?.view, d3d8DrawMatrixScratch.view);
  const engineProjection = projectionRevisionUnchanged
    ? d3d8LastTransformSourceProjection
    : normalizeD3DMatrix(payload.transforms?.projection, d3d8DrawMatrixScratch.projection);
  const view = d3d8XrViewOverride && engineView
    ? multiplyD3D8ColumnMatrices(
      d3d8XrViewOverride.viewPrefix,
      engineView,
      d3d8DrawMatrixScratch.xrView,
    )
    : engineView;
  const projection = d3d8XrViewOverride
    ? d3d8XrViewOverride.projection
    : engineProjection;
  let texture0Transform, texture1Transform, texture2Transform, texture3Transform;
  const transformMask = Number(payload.transformMask ?? 0) >>> 0;
  const useTransforms = transformMask === 7 && world !== null && view !== null && projection !== null;
  const matrixTransformsAreIdentity =
    useTransforms &&
    isIdentityD3DMatrix(world) &&
    isIdentityD3DMatrix(view) &&
    isIdentityD3DMatrix(projection);
  // --- Draw-cache: compare key fields and gate normalize* + derived-object rebuilds ---
  // Key = (derivedStateHash, tex0Id, tex1Id, fvf, stride, primitiveType).
  // primitiveType is added because it affects point-sprite semantics and is NOT
  // covered by the native state hash. The derived hash excludes per-draw
  // world/view/projection transforms but still includes texture transforms and
  // all render/material/light state used by the derived JS objects below.
  const drawCacheTexture0Id = Number(d3d8BoundTextures.get(0) ?? 0) >>> 0;
  const drawCacheTexture1Id = Number(d3d8BoundTextures.get(1) ?? 0) >>> 0;
  const drawCacheTexture2Id = Number(d3d8BoundTextures.get(2) ?? 0) >>> 0;
  const drawCacheTexture3Id = Number(d3d8BoundTextures.get(3) ?? 0) >>> 0;
  let drawCacheHit = d3d8CachedDerived !== null &&
    d3d8LastDrawKey !== null &&
    d3d8LastDrawKey.derivedStateHash === derivedStateHash &&
    d3d8LastDrawKey.texture0Id === drawCacheTexture0Id &&
    d3d8LastDrawKey.texture1Id === drawCacheTexture1Id &&
    d3d8LastDrawKey.texture2Id === drawCacheTexture2Id &&
    d3d8LastDrawKey.texture3Id === drawCacheTexture3Id &&
    d3d8LastDrawKey.vertexShaderFvf === vertexShaderFvf &&
    d3d8LastDrawKey.vertexStride === vertexStride &&
    d3d8LastDrawKey.primitiveType === primitiveType;
  if (!drawCacheHit) {
    const cachedEntry = findD3D8DerivedDrawCacheEntry(
      derivedStateHash,
      drawCacheTexture0Id,
      drawCacheTexture1Id,
      drawCacheTexture2Id,
      drawCacheTexture3Id,
      vertexShaderFvf,
      vertexStride,
      primitiveType,
    );
    if (cachedEntry !== null) {
      d3d8LastDrawKey = cachedEntry;
      d3d8CachedDerived = cachedEntry.derived;
      drawCacheHit = true;
    }
  }
  if (drawCacheHit) {
    if (d3d8PerfCountersEnabled) d3d8PerfStats.drawDerivedCacheHits += 1;
  } else {
    if (d3d8PerfCountersEnabled) d3d8PerfStats.drawDerivedCacheMisses += 1;
  }

  let renderState, clipPlanes, material, lights;
  let fixedFunctionLights, directionalLights, firstDirectionalLight;
  let vertexLayout;
  let texture0Id, texture0Resource, texture0Ready;
  let texture1Id, texture1Resource, texture1Ready;
  let texture2Id, texture2Resource, texture2Ready;
  let texture3Id, texture3Resource, texture3Ready;
  let texture0Coordinates, texture1Coordinates;
  let texture2Coordinates, texture3Coordinates;
  let drawUsesPointSpriteCoordinates;
  let canSampleTexture0, canSampleTexture1;
  let canSampleTexture2, canSampleTexture3;
  let texture0SemanticMode, texture1SemanticMode;
  let texture2SemanticMode, texture3SemanticMode;
  let appliedTexture0Combiner, appliedStage1Combiner;
  let appliedStage2Combiner, appliedStage3Combiner;
  let implicitAlphaCutoutThreshold;
  let depthStencilOnlyFastDerived = false;

  if (drawCacheHit) {
    // Reuse cached derived objects — GL retains state between identical draws,
    // so re-issuing normalize* allocations and uniform writes is redundant.
    const c = d3d8CachedDerived;
    renderState = c.renderState;
    clipPlanes = c.clipPlanes;
    material = c.material;
    lights = c.lights;
    fixedFunctionLights = c.fixedFunctionLights;
    directionalLights = c.directionalLights;
    firstDirectionalLight = c.firstDirectionalLight;
    vertexLayout = c.vertexLayout;
    texture0Id = c.texture0Id;
    texture0Resource = texture0Id !== 0 ? d3d8Textures.get(texture0Id) : null;
    texture0Ready = c.texture0Ready;
    texture1Id = c.texture1Id;
    texture1Resource = texture1Id !== 0 ? d3d8Textures.get(texture1Id) : null;
    texture1Ready = c.texture1Ready;
    texture2Id = c.texture2Id;
    texture2Resource = texture2Id !== 0 ? d3d8Textures.get(texture2Id) : null;
    texture2Ready = c.texture2Ready;
    texture3Id = c.texture3Id;
    texture3Resource = texture3Id !== 0 ? d3d8Textures.get(texture3Id) : null;
    texture3Ready = c.texture3Ready;
    texture0Coordinates = c.texture0Coordinates;
    texture1Coordinates = c.texture1Coordinates;
    texture2Coordinates = c.texture2Coordinates;
    texture3Coordinates = c.texture3Coordinates;
    drawUsesPointSpriteCoordinates = c.drawUsesPointSpriteCoordinates;
    canSampleTexture0 = c.canSampleTexture0;
    canSampleTexture1 = c.canSampleTexture1;
    canSampleTexture2 = c.canSampleTexture2;
    canSampleTexture3 = c.canSampleTexture3;
    texture0SemanticMode = c.texture0SemanticMode;
    texture1SemanticMode = c.texture1SemanticMode;
    texture2SemanticMode = c.texture2SemanticMode;
    texture3SemanticMode = c.texture3SemanticMode;
    appliedTexture0Combiner = c.appliedTexture0Combiner;
    appliedStage1Combiner = c.appliedStage1Combiner;
    appliedStage2Combiner = c.appliedStage2Combiner;
    appliedStage3Combiner = c.appliedStage3Combiner;
    implicitAlphaCutoutThreshold = c.implicitAlphaCutoutThreshold;
    depthStencilOnlyFastDerived = c.depthStencilOnlyFastDerived === true;
    texture0Transform = c.texture0Transform;
    texture1Transform = c.texture1Transform;
    texture2Transform = c.texture2Transform;
    texture3Transform = c.texture3Transform;
  } else {
    // The native D3D8 shim exports complete, immutable state records with all
    // defaults already materialized. Synthetic harness calls still take the
    // defensive normalizers, but real draws can retain the canonical payload
    // directly instead of rebuilding roughly 300 scalar/object fields on each
    // derived-cache miss.
    const canonicalStatePayload = payload.statePayloadCanonical === true;
    renderState = pointerStatePayload
      ? copyD3D8RenderStateFromWasm(payload.renderStatePtr)
      : canonicalStatePayload
        ? payload.renderState
        : normalizeD3D8RenderState(payload.renderState);
    renderState ??= normalizeD3D8RenderState();
    depthStencilOnlyFastDerived = pixelShaderHandle === 0 && !sm1VertexDraw &&
      d3d8DiagLevel !== "full" &&
      d3d8CanUseDepthStencilOnlyProgramWithoutTextureProbe(renderState, primitiveType);
    const preserveDiagnosticState = d3d8DiagLevel === "full";
    const clipPlanesNeeded = preserveDiagnosticState || d3d8ClipPlaneMask(renderState) !== 0;
    const materialNeeded = preserveDiagnosticState ||
      (!depthStencilOnlyFastDerived && renderState.lighting !== 0);
    if (pointerStatePayload) {
      if (clipPlanesNeeded) {
        if (d3d8PerfCountersEnabled) d3d8PerfStats.drawClipPlanePayloadCopies += 1;
      } else {
        if (d3d8PerfCountersEnabled) d3d8PerfStats.drawClipPlanePayloadSkips += 1;
      }
      if (materialNeeded) {
        if (d3d8PerfCountersEnabled) d3d8PerfStats.drawMaterialPayloadCopies += 1;
      } else {
        if (d3d8PerfCountersEnabled) d3d8PerfStats.drawMaterialPayloadSkips += 1;
      }
    }
    clipPlanes = clipPlanesNeeded
      ? pointerStatePayload
        ? copyD3D8ClipPlanesFromWasm(payload.clipPlanesPtr)
        : canonicalStatePayload
          ? payload.clipPlanes
          : normalizeD3D8ClipPlanes(payload.clipPlanes)
      : D3D8_UNUSED_CLIP_PLANES;
    material = materialNeeded
      ? pointerStatePayload
        ? copyD3D8MaterialFromWasm(payload.materialPtr)
        : canonicalStatePayload
          ? payload.material
          : normalizeD3D8Material(payload.material)
      : D3D8_UNUSED_MATERIAL;
    clipPlanes ??= D3D8_UNUSED_CLIP_PLANES;
    material ??= D3D8_UNUSED_MATERIAL;
    // D3D ignores the texture matrix while transform flags are disabled. Most
    // scene states disable all four, so do not allocate and copy 64 floats for
    // matrices that cannot reach a shader.
    texture0Transform = renderState.textureStages[0].textureTransformFlags !== 0
      ? normalizeD3DMatrix(payload.transforms?.texture0)
      : null;
    texture1Transform = renderState.textureStages[1].textureTransformFlags !== 0
      ? normalizeD3DMatrix(payload.transforms?.texture1)
      : null;
    texture2Transform = renderState.textureStages[2].textureTransformFlags !== 0
      ? normalizeD3DMatrix(payload.transforms?.texture2)
      : null;
    texture3Transform = renderState.textureStages[3].textureTransformFlags !== 0
      ? normalizeD3DMatrix(payload.transforms?.texture3)
      : null;
    // Translated-vs draws carry a shader handle, not an FVF: attributes come
    // from the shader's D3DVSD declaration (bound in
    // configureD3D8SM1DeclAttributes), so substitute a minimal layout for the
    // FVF-driven consumers (fill/shade fallbacks, pretransform checks).
    vertexLayout = sm1VertexDraw
      ? {
          positionComponents: 3,
          pretransformed: false,
          normalOffset: null,
          diffuseOffset: null,
          specularOffset: null,
          texCoords: [],
        }
      : d3d8VertexLayoutInfo(vertexShaderFvf, vertexStride);
    texture0Id = drawCacheTexture0Id;
    texture1Id = drawCacheTexture1Id;
    texture2Id = drawCacheTexture2Id;
    texture3Id = drawCacheTexture3Id;
    const lightsNeeded = preserveDiagnosticState ||
      (!depthStencilOnlyFastDerived && renderState.lighting !== 0);
    if (pointerStatePayload) {
      if (lightsNeeded) {
        if (d3d8PerfCountersEnabled) d3d8PerfStats.drawLightPayloadCopies += 1;
      } else {
        if (d3d8PerfCountersEnabled) d3d8PerfStats.drawLightPayloadSkips += 1;
      }
    }
    if (depthStencilOnlyFastDerived) {
      lights = D3D8_UNUSED_LIGHTS;
      fixedFunctionLights = D3D8_UNUSED_LIGHTS;
      directionalLights = D3D8_UNUSED_LIGHTS;
      firstDirectionalLight = null;
      texture0Resource = null;
      texture0Ready = false;
      texture1Resource = null;
      texture1Ready = false;
      texture2Resource = null;
      texture2Ready = false;
      texture3Resource = null;
      texture3Ready = false;
      texture0Coordinates = disabledTextureStageCoordinateInfo(0);
      texture1Coordinates = disabledTextureStageCoordinateInfo(1);
      texture2Coordinates = disabledTextureStageCoordinateInfo(2);
      texture3Coordinates = disabledTextureStageCoordinateInfo(3);
      drawUsesPointSpriteCoordinates = false;
      canSampleTexture0 = false;
      canSampleTexture1 = false;
      canSampleTexture2 = false;
      canSampleTexture3 = false;
      texture0SemanticMode = 0;
      texture1SemanticMode = 0;
      texture2SemanticMode = 0;
      texture3SemanticMode = 0;
      appliedTexture0Combiner = null;
      appliedStage1Combiner = null;
      appliedStage2Combiner = null;
      appliedStage3Combiner = null;
      implicitAlphaCutoutThreshold = -1;
    } else {
      lights = lightsNeeded
        ? pointerStatePayload
          ? copyD3D8LightsFromWasm(payload.lightsPtr)
          : canonicalStatePayload
            ? payload.lights
            : normalizeD3D8Lights(payload.lights)
        : D3D8_UNUSED_LIGHTS;
      lights ??= D3D8_UNUSED_LIGHTS;
      fixedFunctionLights = lightsNeeded
        ? d3d8FixedFunctionLights(lights) : D3D8_UNUSED_LIGHTS;
      directionalLights = lightsNeeded
        ? d3d8DirectionalLights(lights) : D3D8_UNUSED_LIGHTS;
      firstDirectionalLight = directionalLights[0] ?? null;
      texture0Resource = texture0Id !== 0 ? d3d8Textures.get(texture0Id) : null;
      texture0Ready = Boolean(
        (texture0Resource?.target ?? gl?.TEXTURE_2D) === gl?.TEXTURE_2D &&
        texture0Resource?.initializedLevels?.has("0"));
      texture1Resource = texture1Id !== 0 ? d3d8Textures.get(texture1Id) : null;
      texture1Ready = Boolean(
        (texture1Resource?.target ?? gl?.TEXTURE_2D) === gl?.TEXTURE_2D &&
        texture1Resource?.initializedLevels?.has("0"));
      texture2Resource = texture2Id !== 0 ? d3d8Textures.get(texture2Id) : null;
      texture2Ready = Boolean(
        (texture2Resource?.target ?? gl?.TEXTURE_2D) === gl?.TEXTURE_2D &&
        texture2Resource?.initializedLevels?.has("0"));
      texture3Resource = texture3Id !== 0 ? d3d8Textures.get(texture3Id) : null;
      texture3Ready = Boolean(
        (texture3Resource?.target ?? gl?.TEXTURE_2D) === gl?.TEXTURE_2D &&
        texture3Resource?.initializedLevels?.has("0"));
      texture0Coordinates = textureStageCoordinateInfo(
        renderState.textureStages[0],
        0,
        vertexStride,
        vertexLayout,
        texture0Transform,
      );
      texture1Coordinates = textureStageCoordinateInfo(
        renderState.textureStages[1],
        1,
        vertexStride,
        vertexLayout,
        texture1Transform,
      );
      texture2Coordinates = textureStageCoordinateInfo(
        renderState.textureStages[2],
        2,
        vertexStride,
        vertexLayout,
        texture2Transform,
      );
      texture3Coordinates = textureStageCoordinateInfo(
        renderState.textureStages[3],
        3,
        vertexStride,
        vertexLayout,
        texture3Transform,
      );
      drawUsesPointSpriteCoordinates =
        (Number(payload.primitiveType ?? 0) >>> 0) === D3DPT_POINTLIST &&
        Number(renderState.pointSpriteEnable ?? 0) !== 0;
      canSampleTexture0 = Boolean(
        texture0Ready && (texture0Coordinates.supported || drawUsesPointSpriteCoordinates));
      canSampleTexture1 = Boolean(
        texture1Ready && (texture1Coordinates.supported || drawUsesPointSpriteCoordinates));
      // Stages 2/3 do not participate in point-sprite gl_PointCoord substitution;
      // they read either a vertex UV set (coordSet 0/1) or a generated
      // camera-space coordinate.
      canSampleTexture2 = Boolean(texture2Ready && texture2Coordinates.supported);
      canSampleTexture3 = Boolean(texture3Ready && texture3Coordinates.supported);
      if (sm1VertexDraw) {
        // Translated-vs draws source texture coordinates from the vertex
        // shader's oT outputs, not the FVF/texgen pipeline — sampling only
        // requires the texture itself to be ready.
        canSampleTexture0 = texture0Ready;
        canSampleTexture1 = texture1Ready;
        canSampleTexture2 = texture2Ready;
        canSampleTexture3 = texture3Ready;
      }
      texture0SemanticMode = canSampleTexture0 ? d3d8TextureSemanticMode(texture0Resource) : 0;
      texture1SemanticMode = canSampleTexture1 ? d3d8TextureSemanticMode(texture1Resource) : 0;
      texture2SemanticMode = canSampleTexture2 ? d3d8TextureSemanticMode(texture2Resource) : 0;
      texture3SemanticMode = canSampleTexture3 ? d3d8TextureSemanticMode(texture3Resource) : 0;
      appliedTexture0Combiner = textureStageCombinerInfo(renderState.textureStages[0], 0, canSampleTexture0);
      appliedStage1Combiner = textureStageCombinerInfo(renderState.textureStages[1], 1, canSampleTexture1);
      appliedStage2Combiner = textureStageCombinerInfo(renderState.textureStages[2], 2, canSampleTexture2);
      appliedStage3Combiner = textureStageCombinerInfo(renderState.textureStages[3], 3, canSampleTexture3);
      implicitAlphaCutoutThreshold = d3d8ImplicitAlphaCutoutThreshold(
        renderState,
        canSampleTexture0,
        texture0Resource,
        canSampleTexture1,
        texture1Resource,
      );
    }
    // Update draw-cache for next draw
    d3d8CachedDerived = {
      renderState, clipPlanes, material, lights,
      fixedFunctionLights, directionalLights, firstDirectionalLight,
      vertexLayout,
      texture0Id, texture0Ready, texture1Id, texture1Ready,
      texture2Id, texture2Ready, texture3Id, texture3Ready,
      texture0Coordinates, texture1Coordinates,
      texture2Coordinates, texture3Coordinates,
      drawUsesPointSpriteCoordinates,
      canSampleTexture0, canSampleTexture1,
      canSampleTexture2, canSampleTexture3,
      texture0SemanticMode, texture1SemanticMode,
      texture2SemanticMode, texture3SemanticMode,
      appliedTexture0Combiner, appliedStage1Combiner,
      appliedStage2Combiner, appliedStage3Combiner,
      implicitAlphaCutoutThreshold,
      worldRevision,
      viewRevision,
      projectionRevision,
      depthStencilOnlyFastDerived,
      texture0Transform, texture1Transform,
      texture2Transform, texture3Transform,
    };
    d3d8LastDrawKey = rememberD3D8DerivedDrawCacheEntry(
      derivedStateHash,
      texture0Id,
      texture1Id,
      texture2Id,
      texture3Id,
      vertexShaderFvf,
      vertexStride,
      primitiveType,
      d3d8CachedDerived,
    );
  }
  if (depthStencilOnlyFastDerived) {
    if (d3d8PerfCountersEnabled) d3d8PerfStats.drawDepthStencilOnlyFastDerivedDraws += 1;
  }
  const usesDestinationAlpha = renderState.alphaBlendEnable !== 0 &&
    (renderState.srcBlend === D3DBLEND_DESTALPHA ||
      renderState.srcBlend === D3DBLEND_INVDESTALPHA ||
      renderState.destBlend === D3DBLEND_DESTALPHA ||
      renderState.destBlend === D3DBLEND_INVDESTALPHA);
  if (usesDestinationAlpha) {
    if (d3d8PerfCountersEnabled) d3d8PerfStats.destinationAlphaBlendDraws += 1;
    if (d3d8CurrentFramebuffer !== null) {
      if (d3d8PerfCountersEnabled) d3d8PerfStats.destinationAlphaBlendOffscreenDraws += 1;
    }
  }
  // Terrain noise/cloud/lightmap detail-pass diagnostic. The original
  // TerrainShader2Stage::set(pass==2) noise/cloud pass (and the single-pass
  // ST_TERRAIN_BASE_NOISE12 variant) projects a noise/cloud texture onto the
  // terrain via D3DTSS_TCI_CAMERASPACEPOSITION generated coordinates plus a
  // D3DTS_TEXTURE0/1 texture transform, then blends multiplicatively with
  // SRCBLEND=DESTCOLOR / DESTBLEND=ZERO (see
  // GeneralsMD/.../W3DDevice/GameClient/W3DShaderManager.cpp). Counting these
  // draws (and whether their texture transform is non-identity) lets the
  // real-GPU harness confirm the fine noise + lightmap detail layer is
  // actually being emitted. If terrain looks flat, the usual cause is the
  // engine LOD / Options gate leaving m_useLightMap / m_useCloudMap off so the
  // ST_TERRAIN_BASE_NOISE* technique is never selected upstream (in which case
  // this counter stays 0), not a lost pass in the D3D8->WebGL2 bridge.
  if (d3d8PerfCountersEnabled) {
    d3d8NoteTerrainNoiseMultiplyDraw(
      renderState,
      canSampleTexture0,
      texture0Coordinates,
      texture0Transform,
      canSampleTexture1,
      texture1Coordinates,
      texture1Transform,
    );
  }
  const vertexPretransformed = vertexLayout?.pretransformed === true;
  const usePositionTransforms = useTransforms && !vertexPretransformed;
  const includeSceneDrawHistory = usePositionTransforms || vertexPretransformed;
  const usesIdentityClipSpace = usePositionTransforms && matrixTransformsAreIdentity;
  recordDrawPhase?.("sortedDrawDerivedMs");
  if (d3d8DiagLevel === "full") {
    warnD3D8CombinerDiagnostics(renderState, appliedTexture0Combiner, appliedStage1Combiner,
      appliedStage2Combiner, appliedStage3Combiner, drawSequence);
  }
  if (d3d8DiagLevel === "full" && texture0Resource) {
    const caps = (harnessState.graphics.uiDrawCaptures ??= { atlas: [], small: [], census: {} });
    const dimKey = `${texture0Resource.width}x${texture0Resource.height}`;
    const census = caps.census;
    if (!census[dimKey]) {
      census[dimKey] = {
        count: 0,
        ready: texture0Ready,
        uploads: texture0Resource.uploads ?? 0,
        initializedLevels: Array.from(texture0Resource.initializedLevels ?? []),
        firstDrawSeq: drawSequence,
        pixelSample: texture0Ready
          ? sampleD3D8TexturePixel(texture0Resource,
              Math.floor(texture0Resource.width / 2),
              Math.floor(texture0Resource.height / 2))
          : null,
        renderState: {
          zEnable: renderState.zEnable, zWriteEnable: renderState.zWriteEnable, zFunc: renderState.zFunc,
          alphaBlendEnable: renderState.alphaBlendEnable, srcBlend: renderState.srcBlend,
          destBlend: renderState.destBlend, textureFactor: renderState.textureFactor,
        },
        stage0: d3d8TextureStageDrawSummary(renderState.textureStages[0]),
      };
    }
    census[dimKey].count += 1;
    if (texture0Resource.width === 1024 && texture0Resource.height === 256 && caps.atlas.length < 8) {
      caps.atlas.push({
        drawSeq: drawSequence,
        frame: harnessState.frame,
        texture0: {
          id: texture0Id,
          width: texture0Resource.width,
          height: texture0Resource.height,
          uploads: texture0Resource.uploads ?? 0,
          ready: texture0Ready,
          initializedLevels: Array.from(texture0Resource.initializedLevels ?? []),
          format: texture0Resource.format,
        },
        canSampleTexture0,
        texture0PixelSample: texture0Ready
          ? sampleD3D8TexturePixel(texture0Resource, 400, 160)
          : null,
        primitiveType: Number(payload.primitiveType ?? 0) >>> 0,
        vertexCount,
        indexCount,
        renderState: {
          zEnable: renderState.zEnable,
          zWriteEnable: renderState.zWriteEnable,
          zFunc: renderState.zFunc,
          alphaBlendEnable: renderState.alphaBlendEnable,
          srcBlend: renderState.srcBlend,
          destBlend: renderState.destBlend,
          alphaTestEnable: renderState.alphaTestEnable,
          textureFactor: renderState.textureFactor,
        },
        stage0: d3d8TextureStageDrawSummary(renderState.textureStages[0]),
        stage1: d3d8TextureStageDrawSummary(renderState.textureStages[1]),
      });
    } else if (texture0Resource.width > 0 && texture0Resource.width <= 128 && texture0Ready && caps.small.length < 4) {
      caps.small.push({
        drawSeq: drawSequence,
        texture0: { width: texture0Resource.width, height: texture0Resource.height, uploads: texture0Resource.uploads ?? 0 },
        renderState: {
          zEnable: renderState.zEnable, zWriteEnable: renderState.zWriteEnable, zFunc: renderState.zFunc,
          alphaBlendEnable: renderState.alphaBlendEnable, srcBlend: renderState.srcBlend, destBlend: renderState.destBlend,
          textureFactor: renderState.textureFactor,
        },
        stage0: d3d8TextureStageDrawSummary(renderState.textureStages[0]),
        texture0PixelSample: sampleD3D8TexturePixel(texture0Resource, Math.floor(texture0Resource.width / 2), Math.floor(texture0Resource.height / 2)),
      });
    }
  }
  recordDrawPhase?.("sortedDrawTextureDiagMs");
  let appliedViewport = null;
  let appliedRenderState = null;
  let appliedTexture0Sampler = null;
  let appliedTexture1Sampler = null;
  let appliedTexture2Sampler = null;
  let appliedTexture3Sampler = null;
  let appliedFillMode = null;
  let appliedShadeMode = null;
  let appliedPointSprite = null;
  let vertexDiagnostics = null;
  let drawOk = false;
  const collectDrawDiagnostics = d3d8DiagLevel === "full";
  syncCanvasSize({ restoreViewport: false, refreshState: false, flushPending: false });
  appliedViewport = applyD3D8Viewport("draw");
  appliedPointSprite = d3d8PointSpriteInfo(renderState, payload.primitiveType, appliedViewport);
  recordDrawPhase?.("sortedDrawViewportMs");
  if (collectDrawDiagnostics) {
    vertexDiagnostics = inspectD3D8DrawVertices(
      vertexResource,
      vertexByteOffset,
      vertexStride,
      vertexCount,
      vertexLayout,
      usePositionTransforms ? { world, view, projection } : null,
      appliedViewport,
      indexResource,
      indexByteOffset,
      indexCount,
      indexSize,
    );
    if (vertexDiagnostics) {
      vertexDiagnostics.triangles = inspectD3D8IndexedTriangles(
        vertexResource,
        vertexByteOffset,
        vertexStride,
        indexResource,
        indexByteOffset,
        indexCount,
        indexSize,
        payload.primitiveType,
        usePositionTransforms ? { world, view, projection } : null,
        vertexLayout,
        appliedViewport,
      );
    }
  }
  const preDrawCenterPixel = collectDrawDiagnostics
    ? sampleCanvasPixel(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2))
    : null;
  let centerPixel = preDrawCenterPixel;
  recordDrawPhase?.("sortedDrawDiagnosticsMs");
  resetDrawSubphase?.();

  if (gl && d3d8GlPrimitiveSupported(baseGlPrimitive) && usePersistentBuffers &&
      vertexByteSize > 0 && indexByteSize > 0 &&
      vertexStride >= 12 && indexCount > 0 && (indexSize === 2 || indexSize === 4)) {
    const depthStencilOnlyDraw = pixelShaderHandle === 0 && !sm1VertexDraw &&
      d3d8CanUseDepthStencilOnlyProgram(
        renderState,
        payload.primitiveType,
        implicitAlphaCutoutThreshold,
      );
    // Shadow-volume (and other color-masked) draws with no active clip
    // planes take the discard-free program so the GPU keeps early
    // depth/stencil rejection — see ensureD3D8DepthStencilNoClipProgram.
    const depthStencilNeedsClipPlanes = depthStencilOnlyDraw &&
      !vertexPretransformed &&
      d3d8ClipPlaneMask(renderState) !== 0;
    const unlitTex2VertexDraw = !depthStencilOnlyDraw && !sm1VertexDraw &&
      d3d8CanUseUnlitTex2Program({
        renderState,
        primitiveType: payload.primitiveType,
        vertexShaderFvf,
        vertexStride,
        canSampleTexture0,
        canSampleTexture1,
        canSampleTexture2,
        canSampleTexture3,
        texture0Coordinates,
        texture1Coordinates,
        texture2Coordinates,
        texture3Coordinates,
        usePositionTransforms,
        vertexPretransformed,
      });
    const texture0FlipY = Boolean(canSampleTexture0 && texture0Resource?.renderTargetYFlipped);
    const texture1FlipY = Boolean(canSampleTexture1 && texture1Resource?.renderTargetYFlipped);
    const texture2FlipY = Boolean(canSampleTexture2 && texture2Resource?.renderTargetYFlipped);
    const texture3FlipY = Boolean(canSampleTexture3 && texture3Resource?.renderTargetYFlipped);
    const staticSM1FragmentDraw = pixelShaderHandle !== 0 && !sm1VertexDraw &&
      d3d8CanUseStaticSM1Fragment({
        renderState,
        unlitTex2VertexDraw,
        canSampleTexture0,
        canSampleTexture1,
        canSampleTexture2,
        canSampleTexture3,
        texture0SemanticMode,
        texture1SemanticMode,
        texture2SemanticMode,
        texture3SemanticMode,
        texture0FlipY,
        texture1FlipY,
        texture2FlipY,
        texture3FlipY,
      });
    const simpleFFFragmentKind = !depthStencilOnlyDraw && pixelShaderHandle === 0 &&
        !sm1VertexDraw
      ? d3d8SimpleFFFragmentKind({
          renderState,
          canSampleTexture0,
          canSampleTexture1,
          canSampleTexture2,
          canSampleTexture3,
        })
      : null;
    const fastSimpleFFVariant = d3d8FastSimpleFFVariant({
      fragmentKind: simpleFFFragmentKind,
      renderState,
      primitiveType: payload.primitiveType,
      implicitAlphaCutoutThreshold,
      texture0SemanticMode,
      texture0FlipY,
    });
    const litTex1VertexDraw = d3d8CanUseLitTex1Program({
      renderState,
      primitiveType: payload.primitiveType,
      vertexShaderFvf,
      vertexStride,
      canSampleTexture0,
      canSampleTexture1,
      canSampleTexture2,
      canSampleTexture3,
      texture0Coordinates,
      usePositionTransforms,
      vertexPretransformed,
      fastSimpleFFVariant,
      world,
    });
    let bridgeProgram = depthStencilOnlyDraw
      ? (depthStencilNeedsClipPlanes
        ? ensureD3D8DepthStencilProgram()
        : ensureD3D8DepthStencilNoClipProgram())
      : simpleFFFragmentKind
        ? ensureD3D8SimpleFFProgram(
            simpleFFFragmentKind,
            unlitTex2VertexDraw ? "unlit-tex2" : litTex1VertexDraw ? "lit-tex1" : "generic",
            fastSimpleFFVariant ?? "dynamic",
          )
        : pixelShaderHandle === 0 && unlitTex2VertexDraw
          ? ensureD3D8UnlitTex2Program()
          : ensureD3D8DrawProgram();
    const particleProgramDraw = !depthStencilOnlyDraw && pixelShaderHandle === 0 &&
      !sm1VertexDraw && d3d8CanUseParticleProgram({
        renderState,
        primitiveType: payload.primitiveType,
        vertexShaderFvf,
        vertexStride,
        canSampleTexture0,
        canSampleTexture1,
        canSampleTexture2,
        canSampleTexture3,
        texture0Coordinates,
        texture0SemanticMode,
        implicitAlphaCutoutThreshold,
      });
    if (particleProgramDraw) {
      bridgeProgram = ensureD3D8ParticleProgram();
      if (d3d8PerfCountersEnabled) d3d8PerfStats.particleProgramDraws += 1;
    }
    let usedSM1Program = false;
    if (pixelShaderHandle !== 0 || sm1VertexDraw) {
      // Programmable SM1 draw: use the translated (vertexShader, pixelShader)
      // pair program. A missing pair (translation failed, vs-only draw)
      // falls back to the fixed-function program so the draw stays visible
      // and the failure is countable.
      // Debug bisection: globalThis.__cncSM1ForceFallback (a Set of ps
      // handles, or true for all) forces specific shaders back to the FF
      // program mid-session so an artifact can be pinned to one shader.
      const sm1ForceFallback = globalThis.__cncSM1ForceFallback === true ||
        (globalThis.__cncSM1ForceFallback instanceof Set &&
          globalThis.__cncSM1ForceFallback.has(pixelShaderHandle));
      const sm1Program = sm1ForceFallback ? null : ensureD3D8ShaderPairProgram(
        sm1VertexDraw ? vertexShaderFvf : 0,
        pixelShaderHandle,
        unlitTex2VertexDraw ? "unlit-tex2" : null,
        staticSM1FragmentDraw ? "static" : null,
      );
      if (sm1Program) {
        bridgeProgram = sm1Program;
        usedSM1Program = true;
        if (d3d8PerfCountersEnabled) d3d8PerfStats.sm1ShaderDraws += 1;
        if (sm1VertexDraw) {
          if (d3d8PerfCountersEnabled) d3d8PerfStats.sm1TranslatedVsDraws += 1;
        }
      } else {
        if (d3d8PerfCountersEnabled) d3d8PerfStats.sm1FallbackDraws += 1;
      }
      // Fidelity debugging: capture one representative draw state per pixel
      // shader when globalThis.__cncSM1DebugCapture is set (read the map from
      // globalThis.__cncSM1DebugLog). Records the per-stage inputs a
      // translated shader actually saw so wrong-texgen/wrong-texture bugs
      // can be pinned without guessing.
      if (globalThis.__cncSM1DebugCapture) {
        if (sm1Program) {
          noteD3D8SM1Draw(sm1Program, payload);
        }
        const log = globalThis.__cncSM1DebugLog ?? (globalThis.__cncSM1DebugLog = {});
        const key = `ps${pixelShaderHandle}|vs${sm1VertexDraw ? vertexShaderFvf >>> 0 : 0}`;
        if (!log[key] || (log[key].count ?? 0) < 8) {
          const pixelShader = d3d8SM1PixelShaders.get(pixelShaderHandle);
          const entry = log[key] ?? (log[key] = {
            count: 0,
            instructions: pixelShader?.ir?.instructions?.map((instruction) => instruction.name) ?? [],
            samples: [],
          });
          const diffuseOffset = vertexLayout?.diffuseOffset ?? null;
          const diffuseByteOffset = diffuseOffset === null
            ? -1
            : vertexByteOffset + diffuseOffset;
          const firstVertexDiffuse = diffuseByteOffset >= 0 &&
              vertexResource?.bytes instanceof Uint8Array &&
              diffuseByteOffset + 4 <= vertexResource.bytes.byteLength
            ? d3d8DiffuseRgbaFromBytes(vertexResource.bytes, diffuseByteOffset)
            : null;
          entry.count += 1;
          entry.samples.push({
            usedPairProgram: Boolean(sm1Program),
            vertexShaderFvf,
            vertexStride,
            diffuseOffset,
            firstVertexDiffuse,
            canSample: [canSampleTexture0, canSampleTexture1, canSampleTexture2, canSampleTexture3],
            textureIds: [texture0Id, texture1Id, texture2Id, texture3Id],
            stages: [0, 1, 2, 3].map((stage) => {
              const info = [texture0Coordinates, texture1Coordinates,
                texture2Coordinates, texture3Coordinates][stage];
              return {
                mode: info?.modeName,
                generated: info?.generated,
                transformApplied: info?.transformApplied,
                supported: info?.supported,
              };
            }),
            texture2Transform: texture2Transform ? Array.from(texture2Transform) : null,
            texture3Transform: texture3Transform ? Array.from(texture3Transform) : null,
            psConstants: payload.psConstants ? Array.from(payload.psConstants.slice(0, 8)) : null,
          });
        } else {
          log[key].count += 1;
        }
      }
    }
    const usedUnlitTex2Program = bridgeProgram?.unlitTex2 === true;
    const usedSimpleFFProgram = bridgeProgram?.simpleFF === true;
    const usedFastSimpleFFProgram = bridgeProgram?.fastSimpleFF === true;
    const usedStaticSM1Program = bridgeProgram?.staticSM1 === true;
    if (usedSimpleFFProgram && d3d8PerfCountersEnabled) {
      d3d8PerfStats.simpleFFProgramDraws += 1;
    }
    if (usedFastSimpleFFProgram && d3d8PerfCountersEnabled) {
      d3d8PerfStats.fastSimpleFFProgramDraws += 1;
    }
    if (usedStaticSM1Program && d3d8PerfCountersEnabled) {
      d3d8PerfStats.staticSM1ProgramDraws += 1;
    }
    if (usedUnlitTex2Program && d3d8PerfCountersEnabled) {
      d3d8PerfStats.unlitTex2ProgramDraws += 1;
      if (usedSM1Program) {
        d3d8PerfStats.unlitTex2SM1Draws += 1;
      } else {
        d3d8PerfStats.unlitTex2FixedFunctionDraws += 1;
      }
    }
    if (depthStencilOnlyDraw) {
      if (d3d8PerfCountersEnabled) d3d8PerfStats.drawDepthStencilOnlyProgramDraws += 1;
      if (!depthStencilNeedsClipPlanes) {
        if (d3d8PerfCountersEnabled) d3d8PerfStats.drawDepthStencilNoDiscardDraws += 1;
      }
    }
    bindD3D8Program(bridgeProgram.program);
    const drawCanSampleTexture0 = depthStencilOnlyDraw ? false : canSampleTexture0;
    const drawCanSampleTexture1 = depthStencilOnlyDraw ? false : canSampleTexture1;
    const drawCanSampleTexture2 = depthStencilOnlyDraw ? false : canSampleTexture2;
    const drawCanSampleTexture3 = depthStencilOnlyDraw ? false : canSampleTexture3;
    let textureUniformKey = "depth-stencil-only";
    if (!depthStencilOnlyDraw) {
      textureUniformKey = d3d8CachedDerived.textureUniformKey;
      if (textureUniformKey === undefined) {
        textureUniformKey = d3d8TextureLayoutUniformKey({
          renderState,
          canSampleTexture0,
          canSampleTexture1,
          canSampleTexture2,
          canSampleTexture3,
          texture0Coordinates,
          texture1Coordinates,
          texture2Coordinates,
          texture3Coordinates,
          texture0SemanticMode,
          texture1SemanticMode,
          texture2SemanticMode,
          texture3SemanticMode,
          texture0FlipY,
          texture1FlipY,
          texture2FlipY,
          texture3FlipY,
          implicitAlphaCutoutThreshold,
          texture0Transform,
          texture1Transform,
          texture2Transform,
          texture3Transform,
        });
        d3d8CachedDerived.textureUniformKey = textureUniformKey;
      }
    }
    const renderUniformUnchanged =
      d3d8RenderUniformKeyMatches(
        harnessState.graphics.lastD3D8UniformKey,
        derivedStateHash,
        primitiveType,
        usePositionTransforms,
        vertexPretransformed,
        appliedViewport,
      ) &&
      harnessState.graphics.lastD3D8AppliedRenderState != null;
    const textureUniformUnchanged =
      textureUniformKey === harnessState.graphics.lastD3D8TextureUniformKey;
    if (renderUniformUnchanged) {
      if (d3d8PerfCountersEnabled) d3d8PerfStats.drawUniformCacheHits += 1;
    } else {
      if (d3d8PerfCountersEnabled) d3d8PerfStats.drawUniformCacheMisses += 1;
    }
    if (textureUniformUnchanged) {
      if (d3d8PerfCountersEnabled) d3d8PerfStats.drawTextureUniformCacheHits += 1;
    } else {
      if (d3d8PerfCountersEnabled) d3d8PerfStats.drawTextureUniformCacheMisses += 1;
    }
    recordDrawSubphase?.("sortedDrawProgramMs");
    let fillModeDraw, shadeModeDraw;
    // Per-draw geometry setup: ALWAYS executed (not skippable — geometry changes
    // every draw even when render state is identical).
    const liteSolidDrawInfo = d3d8DiagLevel !== "full"
      ? setD3D8LiteSolidDrawInfo(renderState, payload.primitiveType, indexByteOffset, indexCount)
      : null;
    if (liteSolidDrawInfo) {
      fillModeDraw = liteSolidDrawInfo.fillModeDraw;
      shadeModeDraw = liteSolidDrawInfo.shadeModeDraw;
    } else {
      fillModeDraw = createD3D8FillModeDrawInfo(
        renderState,
        payload.primitiveType,
        indexResource,
        indexByteOffset,
        indexCount,
        indexSize,
        {
          vertexResource,
          vertexByteOffset,
          vertexStride,
          transforms: usePositionTransforms ? { world, view, projection } : null,
        },
      );
      shadeModeDraw = createD3D8ShadeModeDrawInfo(
        renderState,
        payload.primitiveType,
        indexResource,
        indexByteOffset,
        indexCount,
        indexSize,
        fillModeDraw,
      );
    }
    recordDrawSubphase?.("sortedDrawFillShadeMs");
    const temporaryIndices = fillModeDraw.lineIndices ?? shadeModeDraw.triangleIndices ?? null;
    // Dynamic-buffer append redirection: bind the per-range pool buffer the
    // append landed in (uploaded lazily, fresh storage — never a mid-frame
    // write into a GPU-in-flight buffer) with offsets rebased to the range
    // start. Mirror-reading paths above (fill/shade fallbacks) keep original
    // offsets; only the GL binding below uses the effective values.
    let effectiveVertexResource = vertexResource;
    let effectiveVertexBufferId = vertexResource.bindingId ?? vertexBufferId;
    let effectiveVertexByteOffset = vertexByteOffset;
    let effectiveIndexResource = indexResource;
    let effectiveIndexBufferId = indexResource.bindingId ?? indexBufferId;
    if (vertexResource.dynamic === true) {
      // The draw may only read vertices [minVertexIndex,
      // minVertexIndex + vertexCount) relative to the attrib base
      // (D3D8 DrawIndexedPrimitive semantics), so redirection is safe only
      // when that whole window sits inside one recorded append range.
      // Multi-update buffers drawn across ranges use the authoritative shared
      // buffer. Compact rebased snapshots do not preserve this path's complete
      // ring/multi-pass semantics and regress projected shadows and relighting.
      // payload.vertexCount is the shim's uploaded_vertex_count =
      // minVertexIndex + NumVertices, i.e. it already measures from the
      // attrib base to the window end.
      const minVertexIndex = Number(payload.minVertexIndex ?? 0) >>> 0;
      const windowStart = vertexByteOffset + minVertexIndex * vertexStride;
      const windowEnd = vertexByteOffset + vertexCount * vertexStride;
      const range = findD3D8DynamicRange(vertexResource, windowStart);
      const slot = range && vertexByteOffset >= range.start && windowEnd <= range.end &&
          vertexCount > minVertexIndex
        ? ensureD3D8DynamicRangeUploaded(vertexResource, range)
        : null;
      if (slot) {
        effectiveVertexResource = slot;
        effectiveVertexBufferId = slot.id;
        effectiveVertexByteOffset = vertexByteOffset - range.start;
        if (d3d8PerfCountersEnabled) d3d8PerfStats.drawDynamicVertexRedirects += 1;
      } else if (vertexResource.dynRanges?.length > 0) {
        if (d3d8PerfCountersEnabled) d3d8PerfStats.drawDynamicVertexSharedFallbacks += 1;
        const sharedSlot = ensureD3D8DynamicSharedBufferCurrent(vertexResource);
        if (sharedSlot) {
          effectiveVertexResource = sharedSlot;
          effectiveVertexBufferId = sharedSlot.id;
        }
      }
    }
    if (indexResource.dynamic === true && temporaryIndices == null) {
      const range = findD3D8DynamicRange(indexResource, indexByteOffset);
      const slot = range && shadeModeDraw.drawIndexByteOffset >= range.start &&
          (shadeModeDraw.drawIndexByteOffset +
            shadeModeDraw.drawIndexCount * indexSize) <= range.end
        ? ensureD3D8DynamicRangeUploaded(indexResource, range)
        : null;
      if (slot) {
        effectiveIndexResource = slot;
        effectiveIndexBufferId = slot.id;
        shadeModeDraw.drawIndexByteOffset -= range.start;
        if (d3d8PerfCountersEnabled) d3d8PerfStats.drawDynamicIndexRedirects += 1;
      } else if (indexResource.dynRanges?.length > 0) {
        if (d3d8PerfCountersEnabled) d3d8PerfStats.drawDynamicIndexSharedFallbacks += 1;
        const sharedSlot = ensureD3D8DynamicSharedBufferCurrent(indexResource);
        if (sharedSlot) {
          effectiveIndexResource = sharedSlot;
          effectiveIndexBufferId = sharedSlot.id;
        }
      }
    } else if (indexResource.dynamic === true) {
      // Temp-index fallback paths read the mirror, not the GL buffer.
    }
    let vertexAttribKey = null;
    if (bridgeProgram.declLayout) {
      // Translated-vs draw: attributes bind by the shader's D3DVSD
      // declaration, bypassing the FVF attribute/VAO caches.
      configureD3D8SM1DeclAttributes(
        bridgeProgram,
        effectiveVertexResource,
        effectiveVertexByteOffset,
        vertexStride,
      );
    } else {
    vertexAttribKey = setD3D8ScratchVertexAttribKey({
      vertexBufferId: effectiveVertexBufferId,
      vertexByteOffset: effectiveVertexByteOffset,
      vertexStride,
      bridgeProgram,
      vertexLayout,
      canSampleTexture0: drawCanSampleTexture0,
      texture0Coordinates,
      canSampleTexture1: drawCanSampleTexture1,
      texture1Coordinates,
    });
    const canUseVertexArrayCache = Boolean(
      d3d8VertexArraySupported() &&
      temporaryIndices == null,
    );
    const currentVertexArrayMatches =
      d3d8CurrentVertexArray !== null &&
      d3d8VertexArrayKeyMatches(d3d8CurrentVertexArrayKey, vertexAttribKey, effectiveIndexBufferId);
    const vertexAttribAlreadyBound = currentVertexArrayMatches ||
      (d3d8CurrentVertexArray === null &&
        d3d8VertexAttribKeyMatches(d3d8LastVertexAttribKey, vertexAttribKey));
    if (vertexAttribAlreadyBound) {
      if (d3d8PerfCountersEnabled) d3d8PerfStats.drawVertexAttribCacheHits += 1;
      if (currentVertexArrayMatches && canUseVertexArrayCache && d3d8CurrentVertexArrayKey) {
        touchD3D8VertexArrayCacheEntry(d3d8CurrentVertexArrayKey);
      }
    } else {
      const cachedVertexArray = canUseVertexArrayCache
        ? findD3D8VertexArrayCacheEntry(vertexAttribKey, effectiveIndexBufferId)
        : null;
      if (cachedVertexArray?.vertexArray) {
        if (d3d8PerfCountersEnabled) d3d8PerfStats.drawVertexAttribCacheHits += 1;
        if (d3d8PerfCountersEnabled) d3d8PerfStats.drawVertexArrayCacheHits += 1;
        bindD3D8VertexArray(
          cachedVertexArray.vertexArray,
          cachedVertexArray,
          cachedVertexArray.elementArrayBuffer,
          cachedVertexArray,
        );
        applyD3D8DefaultVertexAttribValues(
          bridgeProgram,
          vertexLayout,
          drawCanSampleTexture0,
          texture0Coordinates,
          drawCanSampleTexture1,
          texture1Coordinates,
        );
      } else {
        if (d3d8PerfCountersEnabled) d3d8PerfStats.drawVertexAttribCacheMisses += 1;
        if (canUseVertexArrayCache) {
          if (d3d8PerfCountersEnabled) d3d8PerfStats.drawVertexArrayCacheMisses += 1;
          const vertexArray = gl.createVertexArray();
          if (vertexArray) {
            const cachedEntry = rememberD3D8VertexArray(
              vertexAttribKey,
              effectiveIndexBufferId,
              vertexArray,
              effectiveIndexResource.buffer,
            );
            bindD3D8VertexArray(vertexArray, cachedEntry, null, cachedEntry);
            configureD3D8VertexAttribPointers({
              bridgeProgram,
              vertexResource: effectiveVertexResource,
              vertexByteOffset: effectiveVertexByteOffset,
              vertexStride,
              vertexLayout,
              canSampleTexture0: drawCanSampleTexture0,
              texture0Coordinates,
              canSampleTexture1: drawCanSampleTexture1,
              texture1Coordinates,
            });
            bindD3D8ElementArrayBufferForVertexArray(effectiveIndexResource.buffer);
          } else {
            bindD3D8DefaultVertexArray();
            configureD3D8VertexAttribPointers({
              bridgeProgram,
              vertexResource: effectiveVertexResource,
              vertexByteOffset: effectiveVertexByteOffset,
              vertexStride,
              vertexLayout,
              canSampleTexture0: drawCanSampleTexture0,
              texture0Coordinates,
              canSampleTexture1: drawCanSampleTexture1,
              texture1Coordinates,
            });
          }
        } else {
          bindD3D8DefaultVertexArray();
          configureD3D8VertexAttribPointers({
            bridgeProgram,
            vertexResource: effectiveVertexResource,
            vertexByteOffset: effectiveVertexByteOffset,
            vertexStride,
            vertexLayout,
            canSampleTexture0: drawCanSampleTexture0,
            texture0Coordinates,
            canSampleTexture1: drawCanSampleTexture1,
            texture1Coordinates,
          });
        }
        if (!d3d8VertexAttribKeyMatches(d3d8LastVertexAttribKey, vertexAttribKey)) {
          d3d8LastVertexAttribKey = cloneD3D8VertexAttribKey(vertexAttribKey);
        }
      }
    }
    }
    recordDrawSubphase?.("sortedDrawVertexAttribMs");
    // Texture handles are not in the state hash, so bind/sampler state is
    // cached against the actual WebGL texture unit state.
    if (drawCanSampleTexture0) {
      appliedTexture0Sampler = ensureD3D8DrawTexture2D(
        0,
        renderState.textureStages[0],
        texture0Resource,
      );
    }
    if (drawCanSampleTexture1) {
      appliedTexture1Sampler = ensureD3D8DrawTexture2D(
        1,
        renderState.textureStages[1],
        texture1Resource,
      );
    }
    if (drawCanSampleTexture2) {
      appliedTexture2Sampler = ensureD3D8DrawTexture2D(
        2,
        renderState.textureStages[2],
        texture2Resource,
      );
    }
    if (drawCanSampleTexture3) {
      appliedTexture3Sampler = ensureD3D8DrawTexture2D(
        3,
        renderState.textureStages[3],
        texture3Resource,
      );
    }
    if (bridgeProgram.sm1Pair) {
      uploadD3D8SM1DrawUniforms(bridgeProgram, payload, renderState);
      if (bridgeProgram.sm1VsHandle) {
        const xrClipTransform = computeD3D8XrClipTransform(engineView, engineProjection);
        if (d3d8XrViewOverride && !xrClipTransform) {
          throw new Error("cannot transform programmable D3D8 vertex output into WebXR eye space");
        }
        d3d8CachedUniform1i(bridgeProgram.useXrClipTransform, xrClipTransform ? 1 : 0);
        if (xrClipTransform) {
          d3d8CachedUniformMatrix4fv(bridgeProgram.xrClipTransform, xrClipTransform);
        }
      }
    }
    recordDrawSubphase?.("sortedDrawTextureBindMs");
    recordDrawPhase?.("sortedDrawGeometryMs");
    resetDrawSubphase?.();
    // Apply render/material/light uniforms only when changed. This key excludes
    // world/view/projection and bound texture IDs; those have narrower caches
    // below.
    if (!renderUniformUnchanged) {
      const applyRenderStateStartedAt = drawSubphaseProfiled ? perfNow() : 0;
      appliedRenderState = applyD3D8RenderState(
        renderState,
        D3D8_NORMALIZED_RENDER_STATE_OPTIONS,
      );
      if (drawSubphaseProfiled) {
        const elapsed = perfNow() - applyRenderStateStartedAt;
        if (sortedDrawProfiled) {
          if (d3d8PerfCountersEnabled) d3d8PerfStats.sortedDrawApplyRenderStateMs += elapsed;
        }
        noteD3D8DrawProducerPhaseMs(
          drawProducerEntry,
          "sortedDrawApplyRenderStateMs",
          elapsed,
          sortedDrawProfiled,
        );
      }
      let renderUniformDetailStartedAt = drawSubphaseProfiled ? perfNow() : 0;
      const recordRenderUniformDetail = drawSubphaseProfiled
        ? (field) => {
            const now = perfNow();
            const elapsed = now - renderUniformDetailStartedAt;
            if (sortedDrawProfiled) {
              d3d8PerfStats[field] += elapsed;
            }
            noteD3D8DrawProducerPhaseMs(drawProducerEntry, field, elapsed, sortedDrawProfiled);
            renderUniformDetailStartedAt = now;
          }
        : null;
      appliedRenderState.clipPlanes = d3d8CachedDerived.clipPlaneInfo ??=
        d3d8ClipPlaneInfo(renderState, clipPlanes);
      appliedRenderState.lightingShaderEnabled = !depthStencilOnlyDraw &&
        !vertexPretransformed &&
        appliedRenderState.lightingEnabled &&
        fixedFunctionLights.length > 0;
      appliedRenderState.specularEnabled = renderState.specularEnable !== 0;
      if (d3d8DiagLevel === "full") {
        appliedRenderState.lighting = {
          ...appliedRenderState.lighting,
          shaderEnabled: appliedRenderState.lightingShaderEnabled,
          normalTransform: {
            source: usePositionTransforms ? "inverseTransposeWorld" : "attribute",
            inverseTransposeWorld: Boolean(usePositionTransforms),
            normalizeNormals: renderState.normalizeNormals !== 0,
          },
          viewDirection: {
            source: renderState.localViewer !== 0 ? "cameraRelative" : "orthogonal",
            localViewer: renderState.localViewer !== 0,
          },
          specular: {
            enabled: appliedRenderState.specularEnabled,
            material: material.specular,
            power: material.power,
            source: renderState.specularMaterialSource,
            sourceName: d3dMaterialSourceName(renderState.specularMaterialSource),
          },
          fixedFunctionLightSupported: fixedFunctionLights.length > 0,
          fixedFunctionLightCount: fixedFunctionLights.length,
          fixedFunctionLights,
          directionalLightSupported: directionalLights.length > 0,
          directionalLightCount: directionalLights.length,
          directionalLights,
          firstDirectionalLight,
        };
      }
      recordRenderUniformDetail?.("sortedDrawRenderBuildMs");
      const baseUniformsUnchanged = d3d8BaseUniformSnapshotMatches(
        usePositionTransforms,
        vertexPretransformed,
        appliedViewport,
        appliedRenderState,
        clipPlanes,
        shadeModeDraw,
      );
      if (baseUniformsUnchanged) {
        if (d3d8PerfCountersEnabled) d3d8PerfStats.drawBaseUniformCacheHits += 1;
      } else {
        if (d3d8PerfCountersEnabled) d3d8PerfStats.drawBaseUniformCacheMisses += 1;
        d3d8CachedUniform1f(bridgeProgram.scale, 1.0);
        d3d8CachedUniform1i(bridgeProgram.useTransforms, usePositionTransforms ? 1 : 0);
        if (bridgeProgram.pretransformedPosition) {
          d3d8CachedUniform1i(bridgeProgram.pretransformedPosition, vertexPretransformed ? 1 : 0);
        }
        if (bridgeProgram.d3dViewport && vertexPretransformed) {
          const viewport = appliedViewport?.d3d ?? { x: 0, y: 0, width: 1, height: 1 };
          d3d8CachedUniform4f(
            bridgeProgram.d3dViewport,
            finiteNumber(viewport.x, 0),
            finiteNumber(viewport.y, 0),
            Math.max(1, finiteNumber(viewport.width, 1)),
            Math.max(1, finiteNumber(viewport.height, 1)),
          );
        }
        if (bridgeProgram.depthBias) {
          d3d8CachedUniform1f(bridgeProgram.depthBias, appliedRenderState.depthBiasNdc);
        }
        const effectiveClipPlaneMask = vertexPretransformed ? 0 : appliedRenderState.clipPlanes.mask;
        if (bridgeProgram.clipPlaneMask) {
          d3d8CachedUniform1i(bridgeProgram.clipPlaneMask, effectiveClipPlaneMask);
        }
        if (bridgeProgram.clipPlanes && effectiveClipPlaneMask !== 0) {
          gl.uniform4fv(bridgeProgram.clipPlanes, flattenD3D8ClipPlanes(clipPlanes));
        }
        if (bridgeProgram.useFlatShade) {
          d3d8CachedUniform1i(bridgeProgram.useFlatShade, shadeModeDraw.usesFlatShader ? 1 : 0);
        }
        if (bridgeProgram.lightingEnabled) {
          d3d8CachedUniform1i(
            bridgeProgram.lightingEnabled,
            appliedRenderState.lightingShaderEnabled ? 1 : 0,
          );
        }
        if (bridgeProgram.specularEnabled) {
          d3d8CachedUniform1i(bridgeProgram.specularEnabled,
            appliedRenderState.specularEnabled ? 1 : 0);
        }
        if (bridgeProgram.normalizeNormals) {
          d3d8CachedUniform1i(bridgeProgram.normalizeNormals,
            appliedRenderState.normalizeNormalsEnabled ? 1 : 0);
        }
        if (bridgeProgram.localViewer) {
          d3d8CachedUniform1i(bridgeProgram.localViewer,
            appliedRenderState.localViewerEnabled ? 1 : 0);
        }
        if (bridgeProgram.colorVertexEnabled) {
          d3d8CachedUniform1i(bridgeProgram.colorVertexEnabled,
            appliedRenderState.colorVertexEnabled ? 1 : 0);
        }
        rememberD3D8BaseUniformSnapshot(
          usePositionTransforms,
          vertexPretransformed,
          appliedViewport,
          appliedRenderState,
          clipPlanes,
          shadeModeDraw,
        );
      }
      recordRenderUniformDetail?.("sortedDrawRenderBaseUniformMs");
      const lightingUniformsNeeded = Boolean(appliedRenderState.lightingShaderEnabled);
      if (!lightingUniformsNeeded) {
        if (d3d8PerfCountersEnabled) d3d8PerfStats.drawMaterialUniformCacheHits += 1;
      } else if (d3d8MaterialUniformsEqual(renderState, material)) {
        if (d3d8PerfCountersEnabled) d3d8PerfStats.drawMaterialUniformCacheHits += 1;
      } else {
        if (d3d8PerfCountersEnabled) d3d8PerfStats.drawMaterialUniformCacheMisses += 1;
        if (bridgeProgram.sceneAmbient) {
          setD3D8Uniform4FromArray(bridgeProgram.sceneAmbient, appliedRenderState.sceneAmbient);
        }
        if (bridgeProgram.materialDiffuse) {
          setD3D8Uniform4FromArray(bridgeProgram.materialDiffuse, material.diffuse);
        }
        if (bridgeProgram.materialAmbient) {
          setD3D8Uniform4FromArray(bridgeProgram.materialAmbient, material.ambient);
        }
        if (bridgeProgram.materialSpecular) {
          setD3D8Uniform4FromArray(bridgeProgram.materialSpecular, material.specular);
        }
        if (bridgeProgram.materialEmissive) {
          setD3D8Uniform4FromArray(bridgeProgram.materialEmissive, material.emissive);
        }
        if (bridgeProgram.materialPower) {
          d3d8CachedUniform1f(bridgeProgram.materialPower, material.power);
        }
        if (bridgeProgram.diffuseMaterialSource) {
          d3d8CachedUniform1i(bridgeProgram.diffuseMaterialSource, renderState.diffuseMaterialSource);
        }
        if (bridgeProgram.specularMaterialSource) {
          d3d8CachedUniform1i(bridgeProgram.specularMaterialSource, renderState.specularMaterialSource);
        }
        if (bridgeProgram.ambientMaterialSource) {
          d3d8CachedUniform1i(bridgeProgram.ambientMaterialSource, renderState.ambientMaterialSource);
        }
        if (bridgeProgram.emissiveMaterialSource) {
          d3d8CachedUniform1i(bridgeProgram.emissiveMaterialSource, renderState.emissiveMaterialSource);
        }
        rememberD3D8MaterialUniforms(renderState, material);
      }
      recordRenderUniformDetail?.("sortedDrawRenderMaterialUniformMs");
      if (!lightingUniformsNeeded) {
        if (d3d8PerfCountersEnabled) d3d8PerfStats.drawFixedLightUniformCacheHits += 1;
      } else {
        const fixedLightUniformKey = d3d8CachedDerived.fixedLightUniformKey ??=
          d3d8FixedLightUniformKey(fixedFunctionLights);
        if (fixedLightUniformKey === d3d8LastFixedLightUniformKey) {
          if (d3d8PerfCountersEnabled) d3d8PerfStats.drawFixedLightUniformCacheHits += 1;
        } else {
          if (d3d8PerfCountersEnabled) d3d8PerfStats.drawFixedLightUniformCacheMisses += 1;
          if (bridgeProgram.fixedLightCount) {
            d3d8CachedUniform1i(bridgeProgram.fixedLightCount, fixedFunctionLights.length);
          }
          if (bridgeProgram.fixedLightType) {
            gl.uniform1iv(bridgeProgram.fixedLightType, flattenD3D8LightType(fixedFunctionLights));
          }
          if (bridgeProgram.fixedLightDiffuse) {
            gl.uniform4fv(bridgeProgram.fixedLightDiffuse,
              flattenD3D8LightColor(fixedFunctionLights, "diffuse", D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT));
          }
          if (bridgeProgram.fixedLightSpecular) {
            gl.uniform4fv(bridgeProgram.fixedLightSpecular,
              flattenD3D8LightColor(fixedFunctionLights, "specular", D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT));
          }
          if (bridgeProgram.fixedLightAmbient) {
            gl.uniform4fv(bridgeProgram.fixedLightAmbient,
              flattenD3D8LightColor(fixedFunctionLights, "ambient", D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT));
          }
          if (bridgeProgram.fixedLightPosition) {
            gl.uniform3fv(bridgeProgram.fixedLightPosition,
              flattenD3D8LightVector(fixedFunctionLights, "position", [0, 0, 0],
                D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT));
          }
          if (bridgeProgram.fixedLightDirection) {
            gl.uniform3fv(bridgeProgram.fixedLightDirection,
              flattenD3D8LightDirection(fixedFunctionLights, D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT));
          }
          if (bridgeProgram.fixedLightRangeAttenuation) {
            gl.uniform4fv(bridgeProgram.fixedLightRangeAttenuation,
              flattenD3D8LightRangeAttenuation(fixedFunctionLights));
          }
          if (bridgeProgram.fixedLightSpot) {
            gl.uniform3fv(bridgeProgram.fixedLightSpot, flattenD3D8LightSpot(fixedFunctionLights));
          }
          d3d8LastFixedLightUniformKey = fixedLightUniformKey;
        }
      }
      recordRenderUniformDetail?.("sortedDrawRenderLightUniformMs");
      const stageUniformKey = depthStencilOnlyDraw
        ? null
        : d3d8CachedDerived.stageUniformKey ??= d3d8StageUniformKey(renderState);
      if (depthStencilOnlyDraw) {
        if (d3d8PerfCountersEnabled) d3d8PerfStats.drawStageUniformCacheHits += 1;
      } else if (stageUniformKey === d3d8LastStageUniformKey) {
        if (d3d8PerfCountersEnabled) d3d8PerfStats.drawStageUniformCacheHits += 1;
      } else {
        if (d3d8PerfCountersEnabled) d3d8PerfStats.drawStageUniformCacheMisses += 1;
        if (bridgeProgram.textureFactor) {
          setD3D8Uniform4FromArray(
            bridgeProgram.textureFactor,
            d3dColorToNormalizedRgba(renderState.textureFactor),
          );
        }
        if (bridgeProgram.stage0ColorOp) {
          d3d8CachedUniform1i(bridgeProgram.stage0ColorOp, renderState.textureStages[0].colorOp);
        }
        if (bridgeProgram.stage0ColorArg0) {
          d3d8CachedUniform1i(bridgeProgram.stage0ColorArg0, renderState.textureStages[0].colorArg0);
        }
        if (bridgeProgram.stage0ColorArg1) {
          d3d8CachedUniform1i(bridgeProgram.stage0ColorArg1, renderState.textureStages[0].colorArg1);
        }
        if (bridgeProgram.stage0ColorArg2) {
          d3d8CachedUniform1i(bridgeProgram.stage0ColorArg2, renderState.textureStages[0].colorArg2);
        }
        if (bridgeProgram.stage0AlphaOp) {
          d3d8CachedUniform1i(bridgeProgram.stage0AlphaOp, renderState.textureStages[0].alphaOp);
        }
        if (bridgeProgram.stage0AlphaArg0) {
          d3d8CachedUniform1i(bridgeProgram.stage0AlphaArg0, renderState.textureStages[0].alphaArg0);
        }
        if (bridgeProgram.stage0AlphaArg1) {
          d3d8CachedUniform1i(bridgeProgram.stage0AlphaArg1, renderState.textureStages[0].alphaArg1);
        }
        if (bridgeProgram.stage0AlphaArg2) {
          d3d8CachedUniform1i(bridgeProgram.stage0AlphaArg2, renderState.textureStages[0].alphaArg2);
        }
        if (bridgeProgram.stage0ResultArg) {
          d3d8CachedUniform1i(bridgeProgram.stage0ResultArg, renderState.textureStages[0].resultArg);
        }
        if (bridgeProgram.stage1ColorOp) {
          d3d8CachedUniform1i(bridgeProgram.stage1ColorOp, renderState.textureStages[1].colorOp);
        }
        if (bridgeProgram.stage1ColorArg0) {
          d3d8CachedUniform1i(bridgeProgram.stage1ColorArg0, renderState.textureStages[1].colorArg0);
        }
        if (bridgeProgram.stage1ColorArg1) {
          d3d8CachedUniform1i(bridgeProgram.stage1ColorArg1, renderState.textureStages[1].colorArg1);
        }
        if (bridgeProgram.stage1ColorArg2) {
          d3d8CachedUniform1i(bridgeProgram.stage1ColorArg2, renderState.textureStages[1].colorArg2);
        }
        if (bridgeProgram.stage1AlphaOp) {
          d3d8CachedUniform1i(bridgeProgram.stage1AlphaOp, renderState.textureStages[1].alphaOp);
        }
        if (bridgeProgram.stage1AlphaArg0) {
          d3d8CachedUniform1i(bridgeProgram.stage1AlphaArg0, renderState.textureStages[1].alphaArg0);
        }
        if (bridgeProgram.stage1AlphaArg1) {
          d3d8CachedUniform1i(bridgeProgram.stage1AlphaArg1, renderState.textureStages[1].alphaArg1);
        }
        if (bridgeProgram.stage1AlphaArg2) {
          d3d8CachedUniform1i(bridgeProgram.stage1AlphaArg2, renderState.textureStages[1].alphaArg2);
        }
        if (bridgeProgram.stage1ResultArg) {
          d3d8CachedUniform1i(bridgeProgram.stage1ResultArg, renderState.textureStages[1].resultArg);
        }
        // Stages 2 and 3 use the same combiner uniforms as 0/1, chained through
        // CURRENT/TEMP by D3DTSS_RESULTARG. A disabled stage (colorOp==DISABLE)
        // passes CURRENT through in the shader, so uploading these is harmless
        // for 0/1-only draws.
        uploadD3D8ExtendedCombinerStageUniforms(
          bridgeProgram.extendedCombinerStageUniforms[0],
          renderState.textureStages[2],
        );
        uploadD3D8ExtendedCombinerStageUniforms(
          bridgeProgram.extendedCombinerStageUniforms[1],
          renderState.textureStages[3],
        );
        d3d8LastStageUniformKey = stageUniformKey;
      }
      recordRenderUniformDetail?.("sortedDrawRenderStageUniformMs");
      const alphaFogUniformKey = depthStencilOnlyDraw
        ? null
        : d3d8CachedDerived.alphaFogUniformKey ??=
          d3d8AlphaFogUniformKey(renderState, appliedRenderState);
      if (depthStencilOnlyDraw) {
        if (d3d8PerfCountersEnabled) d3d8PerfStats.drawAlphaFogUniformCacheHits += 1;
      } else if (alphaFogUniformKey === d3d8LastAlphaFogUniformKey) {
        if (d3d8PerfCountersEnabled) d3d8PerfStats.drawAlphaFogUniformCacheHits += 1;
      } else {
        if (d3d8PerfCountersEnabled) d3d8PerfStats.drawAlphaFogUniformCacheMisses += 1;
        if (bridgeProgram.alphaTestEnabled) {
          d3d8CachedUniform1i(
            bridgeProgram.alphaTestEnabled,
            appliedRenderState.alphaTestEnabled ? 1 : 0,
          );
        }
        if (bridgeProgram.alphaFunc) {
          d3d8CachedUniform1i(bridgeProgram.alphaFunc, renderState.alphaFunc);
        }
        if (bridgeProgram.alphaRef) {
          d3d8CachedUniform1f(bridgeProgram.alphaRef, appliedRenderState.alphaRef);
        }
        if (bridgeProgram.fogEnabled) {
          d3d8CachedUniform1i(bridgeProgram.fogEnabled, appliedRenderState.fogEnabled ? 1 : 0);
        }
        if (bridgeProgram.fogRangeEnabled) {
          d3d8CachedUniform1i(
            bridgeProgram.fogRangeEnabled,
            appliedRenderState.fogRangeEnabled ? 1 : 0,
          );
        }
        if (bridgeProgram.fogColor) {
          setD3D8Uniform3FromArray(bridgeProgram.fogColor, appliedRenderState.fogColor);
        }
        if (bridgeProgram.fogStart) {
          d3d8CachedUniform1f(bridgeProgram.fogStart, appliedRenderState.fogStart);
        }
        if (bridgeProgram.fogEnd) {
          d3d8CachedUniform1f(bridgeProgram.fogEnd, appliedRenderState.fogEnd);
        }
        d3d8LastAlphaFogUniformKey = alphaFogUniformKey;
      }
      recordRenderUniformDetail?.("sortedDrawRenderAlphaFogUniformMs");
      harnessState.graphics.lastD3D8AppliedRenderState = appliedRenderState;
      harnessState.graphics.lastD3D8UniformKey = d3d8CaptureRenderUniformKey(
        derivedStateHash,
        primitiveType,
        usePositionTransforms,
        vertexPretransformed,
        appliedViewport,
      );
    } else {
      appliedRenderState = harnessState.graphics.lastD3D8AppliedRenderState;
    }
    recordDrawSubphase?.("sortedDrawRenderUniformMs");
    if (usePositionTransforms) {
      // Direct3D stores row-vector matrices row-major; WebGL interprets this
      // memory as column-major, giving the transpose needed for GLSL
      // column-vector multiplication. The broad uniform cache excludes object
      // transforms, so each matrix upload is cached by its exact uploaded value.
      let transformDetailStartedAt = drawSubphaseProfiled ? perfNow() : 0;
      const recordTransformDetail = drawSubphaseProfiled
        ? (field) => {
            const now = perfNow();
            const elapsed = now - transformDetailStartedAt;
            if (sortedDrawProfiled) {
              d3d8PerfStats[field] += elapsed;
            }
            noteD3D8DrawProducerPhaseMs(drawProducerEntry, field, elapsed, sortedDrawProfiled);
            transformDetailStartedAt = now;
          }
        : null;
      // Native revisions avoid reading or comparing unchanged Wasm matrices.
      // Each linked program retains independent uniform values, so the upload
      // cache lives on its WebGLUniformLocation and survives program switches.
      // Revision-less payloads and repeated SetTransform calls with identical
      // values still take the exact element-wise comparison fallback.
      const worldTransformUnchanged = d3d8TransformUniformMatchesOrUpload(
        bridgeProgram.world,
        world,
        worldRevision,
      );
      if (bridgeProgram.worldNormalMatrix) {
        const worldNormalMatrix = d3d8WorldNormalMatrix(world);
        if (worldNormalMatrix) {
          d3d8CachedUniformMatrix3fv(bridgeProgram.worldNormalMatrix, worldNormalMatrix);
        }
      }
      const viewTransformUnchanged = d3d8TransformUniformMatchesOrUpload(
        bridgeProgram.view,
        view,
        viewRevision,
      );
      const projectionTransformUnchanged = d3d8TransformUniformMatchesOrUpload(
        bridgeProgram.projection,
        projection,
        projectionRevision,
      );
      recordTransformDetail?.("sortedDrawTransformCompareMs");
      if (worldTransformUnchanged && viewTransformUnchanged && projectionTransformUnchanged) {
        if (d3d8PerfCountersEnabled) d3d8PerfStats.drawTransformUniformCacheHits += 1;
      } else {
        if (d3d8PerfCountersEnabled) d3d8PerfStats.drawTransformUniformCacheMisses += 1;
      }
      if (worldTransformUnchanged) {
        if (d3d8PerfCountersEnabled) d3d8PerfStats.drawWorldTransformUniformCacheHits += 1;
      } else {
        if (d3d8PerfCountersEnabled) d3d8PerfStats.drawWorldTransformUniformCacheMisses += 1;
      }
      if (worldRevision !== 0 && !worldRevisionUnchanged) {
        rememberD3D8WorldTransformUniform(world);
      }
      d3d8LastTransformSourceWorldRevision = worldRevision;
      recordTransformDetail?.("sortedDrawWorldTransformUniformMs");
      if (viewTransformUnchanged) {
        if (d3d8PerfCountersEnabled) d3d8PerfStats.drawViewTransformUniformCacheHits += 1;
      } else {
        if (d3d8PerfCountersEnabled) d3d8PerfStats.drawViewTransformUniformCacheMisses += 1;
      }
      if (viewRevision !== 0 && !viewRevisionUnchanged) {
        rememberD3D8ViewTransformUniform(engineView);
      }
      d3d8LastTransformSourceViewRevision = viewRevision;
      recordTransformDetail?.("sortedDrawViewTransformUniformMs");
      if (projectionTransformUnchanged) {
        if (d3d8PerfCountersEnabled) d3d8PerfStats.drawProjectionTransformUniformCacheHits += 1;
      } else {
        if (d3d8PerfCountersEnabled) d3d8PerfStats.drawProjectionTransformUniformCacheMisses += 1;
      }
      if (projectionRevision !== 0 && !projectionRevisionUnchanged) {
        rememberD3D8ProjectionTransformUniform(engineProjection);
      }
      d3d8LastTransformSourceProjectionRevision = projectionRevision;
      recordTransformDetail?.("sortedDrawProjectionTransformUniformMs");
    }
    // Non-transformed draws leave these uniforms unused but still current.
    // Keep the cache hot for the next transformed world-space draw.
    recordDrawSubphase?.("sortedDrawTransformUniformMs");
    harnessState.graphics.lastD3D8StateHash = stateHash;
    if (depthStencilOnlyDraw) {
      if (d3d8PerfCountersEnabled) d3d8PerfStats.drawPointSpriteUniformCacheHits += 1;
    } else if (d3d8PointSpriteUniformsEqual(d3d8LastPointSpriteUniformInfo, appliedPointSprite)) {
      if (d3d8PerfCountersEnabled) d3d8PerfStats.drawPointSpriteUniformCacheHits += 1;
    } else {
      if (d3d8PerfCountersEnabled) d3d8PerfStats.drawPointSpriteUniformCacheMisses += 1;
      if (bridgeProgram.drawingPoints !== null) {
        d3d8CachedUniform1i(bridgeProgram.drawingPoints, appliedPointSprite.drawingPoints ? 1 : 0);
      }
      if (bridgeProgram.pointSpriteEnable !== null) {
        d3d8CachedUniform1i(bridgeProgram.pointSpriteEnable, appliedPointSprite.spriteEnable ? 1 : 0);
      }
      if (bridgeProgram.pointSize !== null) {
        d3d8CachedUniform1f(bridgeProgram.pointSize, appliedPointSprite.pointSize);
      }
      if (bridgeProgram.pointSizeMin !== null) {
        d3d8CachedUniform1f(bridgeProgram.pointSizeMin, appliedPointSprite.pointSizeMin);
      }
      if (bridgeProgram.pointSizeMax !== null) {
        d3d8CachedUniform1f(bridgeProgram.pointSizeMax, appliedPointSprite.pointSizeMax);
      }
      if (bridgeProgram.pointScaleEnable !== null) {
        d3d8CachedUniform1i(bridgeProgram.pointScaleEnable, appliedPointSprite.scaleEnable ? 1 : 0);
      }
      if (bridgeProgram.pointScaleA !== null) {
        d3d8CachedUniform1f(bridgeProgram.pointScaleA, appliedPointSprite.scaleA);
      }
      if (bridgeProgram.pointScaleB !== null) {
        d3d8CachedUniform1f(bridgeProgram.pointScaleB, appliedPointSprite.scaleB);
      }
      if (bridgeProgram.pointScaleC !== null) {
        d3d8CachedUniform1f(bridgeProgram.pointScaleC, appliedPointSprite.scaleC);
      }
      if (bridgeProgram.pointViewportHeight !== null) {
        d3d8CachedUniform1f(bridgeProgram.pointViewportHeight, appliedPointSprite.viewportHeight);
      }
      d3d8LastPointSpriteUniformInfo = { ...appliedPointSprite };
    }
    recordDrawSubphase?.("sortedDrawPointSpriteUniformMs");
    // Texture-layout uniforms change when sampling availability, texture
    // coordinate generation, texture transforms, semantic mode, LOD bias, or
    // implicit alpha cutoff changes. Texture object binding is handled above.
    if (depthStencilOnlyDraw) {
      harnessState.graphics.lastD3D8TextureUniformKey = textureUniformKey;
    } else if (!textureUniformUnchanged) {
      if (bridgeProgram.texture0CoordinateMode) {
        d3d8CachedUniform1i(bridgeProgram.texture0CoordinateMode,
          canSampleTexture0 ? texture0Coordinates.mode : D3DTSS_TCI_PASSTHRU);
      }
      if (bridgeProgram.useTexture0Transform) {
        d3d8CachedUniform1i(bridgeProgram.useTexture0Transform,
          canSampleTexture0 && texture0Coordinates.transformApplied ? 1 : 0);
      }
      if (bridgeProgram.texture0TransformComponentCount) {
        d3d8CachedUniform1i(bridgeProgram.texture0TransformComponentCount,
          canSampleTexture0 && texture0Coordinates.transformApplied
            ? texture0Coordinates.textureTransformComponentCount
            : 0);
      }
      if (bridgeProgram.texture0TransformProjected) {
        d3d8CachedUniform1i(bridgeProgram.texture0TransformProjected,
          canSampleTexture0 &&
            texture0Coordinates.transformApplied &&
            texture0Coordinates.textureTransformProjected
            ? 1
            : 0);
      }
      if (bridgeProgram.texture0Transform && canSampleTexture0 && texture0Coordinates.transformApplied) {
        d3d8CachedUniformMatrix4fv(bridgeProgram.texture0Transform, texture0Transform);
      }
      if (bridgeProgram.texture1CoordinateMode) {
        d3d8CachedUniform1i(bridgeProgram.texture1CoordinateMode,
          canSampleTexture1 ? texture1Coordinates.mode : D3DTSS_TCI_PASSTHRU);
      }
      if (bridgeProgram.useTexture1Transform) {
        d3d8CachedUniform1i(bridgeProgram.useTexture1Transform,
          canSampleTexture1 && texture1Coordinates.transformApplied ? 1 : 0);
      }
      if (bridgeProgram.texture1TransformComponentCount) {
        d3d8CachedUniform1i(bridgeProgram.texture1TransformComponentCount,
          canSampleTexture1 && texture1Coordinates.transformApplied
            ? texture1Coordinates.textureTransformComponentCount
            : 0);
      }
      if (bridgeProgram.texture1TransformProjected) {
        d3d8CachedUniform1i(bridgeProgram.texture1TransformProjected,
          canSampleTexture1 &&
            texture1Coordinates.transformApplied &&
            texture1Coordinates.textureTransformProjected
            ? 1
            : 0);
      }
      if (bridgeProgram.texture1Transform && canSampleTexture1 && texture1Coordinates.transformApplied) {
        d3d8CachedUniformMatrix4fv(bridgeProgram.texture1Transform, texture1Transform);
      }
      if (bridgeProgram.useTexture0) {
        d3d8CachedUniform1i(bridgeProgram.useTexture0, canSampleTexture0 ? 1 : 0);
      }
      if (bridgeProgram.implicitAlphaCutoutThreshold) {
        d3d8CachedUniform1f(bridgeProgram.implicitAlphaCutoutThreshold, implicitAlphaCutoutThreshold);
      }
      if (bridgeProgram.texture0) {
        d3d8CachedUniform1i(bridgeProgram.texture0, 0);
      }
      if (bridgeProgram.texture0LodBias) {
        const texture0LodBias = canSampleTexture0
          ? d3dDwordToFloat(renderState.textureStages[0].mipMapLodBias)
          : 0.0;
        d3d8CachedUniform1f(bridgeProgram.texture0LodBias, texture0LodBias);
      }
      if (bridgeProgram.texture0Semantic) {
        d3d8CachedUniform1i(bridgeProgram.texture0Semantic, texture0SemanticMode);
      }
      if (bridgeProgram.texture0FlipY) {
        d3d8CachedUniform1i(bridgeProgram.texture0FlipY, texture0FlipY ? 1 : 0);
      }
      if (bridgeProgram.useTexture1) {
        d3d8CachedUniform1i(bridgeProgram.useTexture1, canSampleTexture1 ? 1 : 0);
      }
      if (bridgeProgram.texture1) {
        d3d8CachedUniform1i(bridgeProgram.texture1, 1);
      }
      if (bridgeProgram.texture1LodBias) {
        const texture1LodBias = canSampleTexture1
          ? d3dDwordToFloat(renderState.textureStages[1].mipMapLodBias)
          : 0.0;
        d3d8CachedUniform1f(bridgeProgram.texture1LodBias, texture1LodBias);
      }
      if (bridgeProgram.texture1Semantic) {
        d3d8CachedUniform1i(bridgeProgram.texture1Semantic, texture1SemanticMode);
      }
      if (bridgeProgram.texture1FlipY) {
        d3d8CachedUniform1i(bridgeProgram.texture1FlipY, texture1FlipY ? 1 : 0);
      }
      // Stages 2 and 3: coordinate mode, coordSet selection, texture transform,
      // sampler unit, LOD bias, semantic mode. The bridge samples texture unit
      // == stage index (uTexture2->unit 2, uTexture3->unit 3).
      uploadD3D8ExtendedTextureStageUniforms(
        bridgeProgram.extendedTextureStageUniforms[0],
        renderState.textureStages[2],
        canSampleTexture2,
        texture2Coordinates,
        texture2Transform,
        texture2SemanticMode,
        texture2FlipY,
      );
      uploadD3D8ExtendedTextureStageUniforms(
        bridgeProgram.extendedTextureStageUniforms[1],
        renderState.textureStages[3],
        canSampleTexture3,
        texture3Coordinates,
        texture3Transform,
        texture3SemanticMode,
        texture3FlipY,
      );
      harnessState.graphics.lastD3D8TextureUniformKey = textureUniformKey;
    }
    // Fog-of-war shroud UV generation for trees.  The tree FVF (XYZNDUV1) has
    // only one UV set, so stage 1 (the shroud) has no per-vertex UVs and would
    // otherwise sample a single corner texel (always bright) -> trees never
    // darken in fog.  W3DTreeBuffer's Trees.nvv path generates the shroud UV
    // per-vertex from world position; reproduce it here (oT1 = (worldXY + c32) *
    // c33) using the c32/c33 constants captured from SetVertexShaderConstant.
    // This runs every draw (outside the texture-uniform cache) so uTreeShroudGen
    // is reliably reset to 0 for every non-tree draw; the per-location value
    // cache in d3d8CachedUniform1i keeps that free except on actual toggles.
    if (bridgeProgram.treeShroudGen) {
      const treeShroud = payload.treeShroud;
      const isTreeShroudDraw =
        vertexShaderFvf === (D3DFVF_XYZ | D3DFVF_NORMAL | D3DFVF_DIFFUSE | D3DFVF_TEX1) &&
        vertexStride === 36 &&
        canSampleTexture1 &&
        treeShroud &&
        Array.isArray(treeShroud.c33) &&
        treeShroud.c33[0] !== 0;
      d3d8CachedUniform1i(bridgeProgram.treeShroudGen, isTreeShroudDraw ? 1 : 0);
      if (isTreeShroudDraw) {
        if (bridgeProgram.treeShroudOffset) {
          d3d8CachedUniform2f(bridgeProgram.treeShroudOffset, treeShroud.c32[0], treeShroud.c32[1]);
        }
        if (bridgeProgram.treeShroudScale) {
          d3d8CachedUniform2f(bridgeProgram.treeShroudScale, treeShroud.c33[0], treeShroud.c33[1]);
        }
      }
    }
    recordDrawSubphase?.("sortedDrawTextureUniformMs");
    recordDrawPhase?.("sortedDrawUniformMs");
    let temporaryIndexBuffer = null;
    // Lazy provoking-vertex tracking: any pending batch was flushed earlier in
    // this call (batch state keys never match a flat draw), and queued draws
    // are always non-flat, so setting the convention here cannot retroactively
    // affect earlier draws.
    setD3D8FirstVertexConvention(shadeModeDraw.usesFirstVertexConvention === true);
    if (shadeModeDraw.supported &&
        (temporaryIndices instanceof Uint16Array || temporaryIndices instanceof Uint32Array)) {
      temporaryIndexBuffer = getD3D8TemporaryIndexBuffer(temporaryIndices.byteLength);
      if (temporaryIndexBuffer) {
        // bufferData (not bufferSubData): the temporary element buffer is
        // reused every fallback draw, and rewriting live storage mid-frame
        // forces the same ANGLE Metal in-flight sync the dynamic-buffer
        // redirection exists to avoid. Full-replace gets fresh storage.
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, temporaryIndices, gl.STREAM_DRAW);
      } else {
        shadeModeDraw.supported = false;
        shadeModeDraw.fallbackReason = "temporaryIndexBufferCreateFailed";
      }
    } else if (
      d3d8CurrentVertexArray !== null &&
      d3d8VertexArrayKeyMatches(d3d8CurrentVertexArrayKey, vertexAttribKey, effectiveIndexBufferId)
    ) {
      bindD3D8ElementArrayBufferForVertexArray(effectiveIndexResource.buffer);
    } else {
      bindD3D8ElementArrayBuffer(effectiveIndexResource.buffer);
    }
    if (d3d8DiagLevel === "full") {
      appliedFillMode = d3d8FillModeProbeInfo(fillModeDraw);
      appliedShadeMode = d3d8ShadeModeProbeInfo(shadeModeDraw);
    }
    // Fidelity debugging: read back the ACTUAL GL uniform values + texture
    // bindings for the next draw using pixel shader
    // globalThis.__cncSM1UniformDumpPs (ground truth for "was the upload
    // right"; result in globalThis.__cncSM1UniformDump).
    if (globalThis.__cncSM1UniformDumpPs &&
        pixelShaderHandle === globalThis.__cncSM1UniformDumpPs &&
        bridgeProgram.sm1Pair) {
      globalThis.__cncSM1UniformDumpCount = (globalThis.__cncSM1UniformDumpCount ?? 0) + 1;
      if (globalThis.__cncSM1UniformDumpCount >= 8) {
        globalThis.__cncSM1UniformDumpPs = 0;
      }
      const readUniform = (loc) => {
        try {
          const value = loc ? gl.getUniform(bridgeProgram.program, loc) : null;
          return value?.length ? Array.from(value) : value;
        } catch (error) {
          return `err:${error?.message}`;
        }
      };
      const previousActive = gl.getParameter(gl.ACTIVE_TEXTURE);
      const boundAt = [];
      for (let unit = 0; unit < 4; unit += 1) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        boundAt.push(gl.getParameter(gl.TEXTURE_BINDING_2D) ? 1 : 0);
      }
      gl.activeTexture(previousActive);
      const dumpEntry = {
        psHandle: pixelShaderHandle,
        useTexture: [bridgeProgram.useTexture0, bridgeProgram.useTexture1,
          bridgeProgram.useTexture2, bridgeProgram.useTexture3].map(readUniform),
        samplerUnits: [bridgeProgram.texture0, bridgeProgram.texture1,
          bridgeProgram.texture2, bridgeProgram.texture3].map(readUniform),
        coordModes: [bridgeProgram.texture0CoordinateMode, bridgeProgram.texture1CoordinateMode,
          bridgeProgram.texture2CoordinateMode, bridgeProgram.texture3CoordinateMode].map(readUniform),
        useTransforms: [bridgeProgram.useTexture0Transform, bridgeProgram.useTexture1Transform,
          bridgeProgram.useTexture2Transform, bridgeProgram.useTexture3Transform].map(readUniform),
        semantics: [bridgeProgram.texture0Semantic, bridgeProgram.texture1Semantic,
          bridgeProgram.texture2Semantic, bridgeProgram.texture3Semantic].map(readUniform),
        lodBias: [bridgeProgram.texture0LodBias, bridgeProgram.texture1LodBias,
          bridgeProgram.texture2LodBias, bridgeProgram.texture3LodBias].map(readUniform),
        tex2Transform: readUniform(bridgeProgram.texture2Transform),
        tex3Transform: readUniform(bridgeProgram.texture3Transform),
        coordSets: [null, null, bridgeProgram.texture2CoordSet, bridgeProgram.texture3CoordSet].map(readUniform),
        unitHasTexture: boundAt,
        useTransformsFlag: readUniform(bridgeProgram.useTransforms),
        lightingEnabled: readUniform(bridgeProgram.lightingEnabled),
        textureIds: [texture0Id, texture1Id, texture2Id, texture3Id],
        indexCount,
      };
      (globalThis.__cncSM1UniformDumps ?? (globalThis.__cncSM1UniformDumps = [])).push(dumpEntry);
      globalThis.__cncSM1UniformDump = dumpEntry;
    }
    if (fillModeDraw.supported && shadeModeDraw.supported) {
      if (effectiveVertexResource === vertexResource) {
        vertexResource.gpuReferenced = true;
      }
      if (temporaryIndices == null && effectiveIndexResource === indexResource) {
        indexResource.gpuReferenced = true;
      }
      const canQueueAdjacentBatch = Boolean(
        earlyBatchInfo &&
        temporaryIndices == null &&
        shadeModeDraw.usesFirstVertexConvention !== true &&
        shadeModeDraw.glPrimitive === earlyBatchInfo.glPrimitive &&
        shadeModeDraw.drawIndexCount === earlyBatchInfo.indexCount &&
        shadeModeDraw.drawIndexByteOffset === earlyBatchInfo.indexByteOffset,
      );
      if (canQueueAdjacentBatch) {
        queueD3D8PendingDrawBatch(earlyBatchInfo);
      } else {
        const drawStartedAt = perfNow();
        gl.drawElements(
          shadeModeDraw.glPrimitive,
          shadeModeDraw.drawIndexCount,
          indexSize === 4 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
          shadeModeDraw.drawIndexByteOffset,
        );
        if (d3d8PerfCountersEnabled) d3d8PerfStats.draws += 1;
        if (d3d8PerfCountersEnabled) d3d8PerfStats.drawElements += 1;
        if (d3d8PerfCountersEnabled) d3d8PerfStats.drawIndices += Number(shadeModeDraw.drawIndexCount ?? 0) >>> 0;
        if (d3d8PerfCountersEnabled) d3d8PerfStats.drawMs += perfNow() - drawStartedAt;
      }
    }
    recordDrawPhase?.("sortedDrawDrawOrBatchMs");
    if (d3d8DiagLevel === "full") {
      refreshCanvasState();
      centerPixel = sampleCanvasPixel(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2));
      drawOk = fillModeDraw.supported && shadeModeDraw.supported && pixelHasColor(centerPixel);
    } else {
      drawOk = fillModeDraw.supported && shadeModeDraw.supported;
    }
  }

  if (d3d8DiagLevel !== "full") {
    // lite: skip the ~40-field probe, per-draw texture sampling, and the
    // spread-copied draw-history array — keep only the cheap sequence counter.
    recordDrawPhase?.("sortedDrawTailMs");
    finishSortedDrawProfile?.();
    finishDrawProducerProfile?.();
    harnessState.graphics.d3d8DrawIndexedSequence = drawSequence;
    return drawOk ? 1 : 0;
  }

  const probe = {
    ok: drawOk,
    source: "browser_d3d8_draw_indexed",
    drawSequence,
    producer: drawProducer,
    api: harnessState.graphics.api,
    viewport: appliedViewport,
    primitiveType: Number(payload.primitiveType ?? 0),
    baseVertexIndex: Number(payload.baseVertexIndex ?? 0) >>> 0,
    minVertexIndex: Number(payload.minVertexIndex ?? 0) >>> 0,
    firstIndex: Number(payload.firstIndex ?? 0) >>> 0,
    vertexBufferId,
    vertexByteOffset,
    vertexBytes: vertexByteSize,
    vertexCount,
    vertexStride,
    vertexShaderFvf,
    vertexLayout,
    vertexDiagnostics,
    indexBufferId,
    indexByteOffset,
    indexBytes: indexByteSize,
    indexCount,
    indexSize,
    usedPersistentBuffers: usePersistentBuffers,
    transformMask,
    usedTransforms: Boolean(usePositionTransforms),
    pretransformedPosition: Boolean(vertexPretransformed),
    usedIdentityClipSpace: Boolean(usesIdentityClipSpace),
    renderState,
    clipPlanes,
    lights,
    material,
    appliedRenderState,
    appliedMaterial: material,
    fillMode: appliedFillMode,
    shadeMode: appliedShadeMode,
    pointSprite: appliedPointSprite,
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
      texCoordComponents: texture0Coordinates.components,
      texCoordGenerated: texture0Coordinates.generated,
      texCoordUsesVertex: texture0Coordinates.usesVertexTexCoord,
      textureTransformFlags: texture0Coordinates.textureTransformFlags,
      textureTransformModeName: texture0Coordinates.textureTransformModeName,
      textureTransformComponentCount: texture0Coordinates.textureTransformComponentCount,
      textureTransformProjected: texture0Coordinates.textureTransformProjected,
      textureTransformSupported: texture0Coordinates.transformSupported,
      textureTransformApplied: Boolean(canSampleTexture0 && texture0Coordinates.transformApplied),
      textureTransformMatrix: texture0Transform !== null ? Array.from(texture0Transform) : null,
      texCoordSupported: texture0Coordinates.supported,
      width: texture0Resource?.width ?? 0,
      height: texture0Resource?.height ?? 0,
      format: texture0Resource?.format ?? 0,
      storage: texture0Resource?.storage ?? null,
      semantic: texture0Resource?.semantic ?? null,
      alphaCoverage: texture0Resource?.alphaCoverage ?? null,
      implicitAlphaCutoutEligible: d3d8TextureSupportsImplicitAlphaCutout(texture0Resource),
      semanticMode: texture0SemanticMode,
      uploads: texture0Resource?.uploads ?? 0,
      samplePixels: sampleD3D8TextureProbe(texture0Resource),
      sampleVertexPixels: sampleD3D8TextureAtVertexSamples(
        texture0Resource,
        vertexDiagnostics,
        texture0Coordinates.coordSet,
      ),
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
      texCoordComponents: texture1Coordinates.components,
      texCoordGenerated: texture1Coordinates.generated,
      texCoordUsesVertex: texture1Coordinates.usesVertexTexCoord,
      textureTransformFlags: texture1Coordinates.textureTransformFlags,
      textureTransformModeName: texture1Coordinates.textureTransformModeName,
      textureTransformComponentCount: texture1Coordinates.textureTransformComponentCount,
      textureTransformProjected: texture1Coordinates.textureTransformProjected,
      textureTransformSupported: texture1Coordinates.transformSupported,
      textureTransformApplied: Boolean(canSampleTexture1 && texture1Coordinates.transformApplied),
      textureTransformMatrix: texture1Transform !== null ? Array.from(texture1Transform) : null,
      texCoordSupported: texture1Coordinates.supported,
      width: texture1Resource?.width ?? 0,
      height: texture1Resource?.height ?? 0,
      format: texture1Resource?.format ?? 0,
      storage: texture1Resource?.storage ?? null,
      semantic: texture1Resource?.semantic ?? null,
      alphaCoverage: texture1Resource?.alphaCoverage ?? null,
      implicitAlphaCutoutEligible: d3d8TextureSupportsImplicitAlphaCutout(texture1Resource),
      semanticMode: texture1SemanticMode,
      uploads: texture1Resource?.uploads ?? 0,
      samplePixels: sampleD3D8TextureProbe(texture1Resource),
      sampleVertexPixels: sampleD3D8TextureAtVertexSamples(
        texture1Resource,
        vertexDiagnostics,
        texture1Coordinates.coordSet,
      ),
      sampler: appliedTexture1Sampler ?? texture1Resource?.samplerState ?? null,
      combiner: appliedStage1Combiner,
    },
    stage1Combiner: appliedStage1Combiner,
    textureFactor: renderState.textureFactor,
    implicitAlphaCutout: {
      enabled: implicitAlphaCutoutThreshold >= 0,
      threshold: implicitAlphaCutoutThreshold >= 0 ? implicitAlphaCutoutThreshold : null,
    },
    preDrawCenterPixel,
    centerPixel,
  };
  const drawHistoryEntry = {
      ok: probe.ok,
      drawSequence: probe.drawSequence,
      producer: probe.producer,
      primitiveType: probe.primitiveType,
      baseVertexIndex: probe.baseVertexIndex,
      minVertexIndex: probe.minVertexIndex,
      firstIndex: probe.firstIndex,
      vertexBufferId: probe.vertexBufferId,
      vertexCount: probe.vertexCount,
      vertexStride: probe.vertexStride,
      vertexShaderFvf: probe.vertexShaderFvf,
      pretransformedPosition: probe.pretransformedPosition,
      indexBufferId: probe.indexBufferId,
      indexCount: probe.indexCount,
      renderState: {
        cullMode: renderState.cullMode,
        zEnable: renderState.zEnable,
        zWriteEnable: renderState.zWriteEnable,
        zFunc: renderState.zFunc,
        alphaBlendEnable: renderState.alphaBlendEnable,
        srcBlend: renderState.srcBlend,
        destBlend: renderState.destBlend,
        alphaTestEnable: renderState.alphaTestEnable,
        alphaFunc: renderState.alphaFunc,
        alphaRef: renderState.alphaRef,
        colorWriteEnable: renderState.colorWriteEnable,
        stencilEnable: renderState.stencilEnable,
        stencilFail: renderState.stencilFail,
        stencilZFail: renderState.stencilZFail,
        stencilPass: renderState.stencilPass,
        stencilFunc: renderState.stencilFunc,
        stencilRef: renderState.stencilRef,
        stencilMask: renderState.stencilMask,
        stencilWriteMask: renderState.stencilWriteMask,
        fillMode: renderState.fillMode,
        zBias: renderState.zBias,
        shadeMode: renderState.shadeMode,
        lighting: renderState.lighting,
        clipping: renderState.clipping,
        clipPlaneEnable: renderState.clipPlaneEnable,
        textureStage0: d3d8TextureStageDrawSummary(renderState.textureStages[0]),
        textureStage1: d3d8TextureStageDrawSummary(renderState.textureStages[1]),
      },
      appliedRenderState: {
        cull: appliedRenderState?.cull ?? null,
        depth: appliedRenderState?.depth ?? null,
        blend: appliedRenderState?.blend ?? null,
        stencil: appliedRenderState?.stencil ?? null,
        alphaTest: appliedRenderState?.alphaTest ?? null,
        implicitAlphaCutout: probe.implicitAlphaCutout,
        colorWrite: appliedRenderState?.colorWrite ?? null,
        clipPlanes: appliedRenderState?.clipPlanes ?? null,
      },
      activeLights: d3d8DiagLevel === "full" ? fixedFunctionLights.map((light) => ({
        index: light.index,
        type: light.type,
        diffuse: light.diffuse,
        position: light.position,
        range: light.range,
        attenuation0: light.attenuation0,
        attenuation1: light.attenuation1,
        attenuation2: light.attenuation2,
      })) : [],
      boundTextures: probe.boundTextures,
      texture0: {
        id: probe.texture0.id,
        ready: probe.texture0.ready,
        sampled: probe.texture0.sampled,
        width: probe.texture0.width,
        height: probe.texture0.height,
        format: probe.texture0.format,
        storage: probe.texture0.storage,
        semantic: probe.texture0.semantic,
        alphaCoverage: probe.texture0.alphaCoverage,
        implicitAlphaCutoutEligible: probe.texture0.implicitAlphaCutoutEligible,
        semanticMode: probe.texture0.semanticMode,
        uploads: probe.texture0.uploads,
        completeMipChain: probe.texture0.completeMipChain,
        texCoordIndex: probe.texture0.texCoordIndex,
        texCoordSet: probe.texture0.texCoordSet,
        textureTransformFlags: probe.texture0.textureTransformFlags,
        samplePixels: probe.texture0.samplePixels,
        sampleVertexPixels: probe.texture0.sampleVertexPixels,
        combiner: probe.texture0.combiner,
      },
      texture1: {
        id: probe.texture1.id,
        ready: probe.texture1.ready,
        sampled: probe.texture1.sampled,
        width: probe.texture1.width,
        height: probe.texture1.height,
        format: probe.texture1.format,
        storage: probe.texture1.storage,
        semantic: probe.texture1.semantic,
        alphaCoverage: probe.texture1.alphaCoverage,
        implicitAlphaCutoutEligible: probe.texture1.implicitAlphaCutoutEligible,
        semanticMode: probe.texture1.semanticMode,
        uploads: probe.texture1.uploads,
        completeMipChain: probe.texture1.completeMipChain,
        texCoordIndex: probe.texture1.texCoordIndex,
        texCoordSet: probe.texture1.texCoordSet,
        textureTransformFlags: probe.texture1.textureTransformFlags,
        samplePixels: probe.texture1.samplePixels,
        sampleVertexPixels: probe.texture1.sampleVertexPixels,
        combiner: probe.texture1.combiner,
      },
      vertexSummary: d3d8DrawVertexSummary(vertexDiagnostics),
      preDrawCenterPixel,
      centerPixel,
  };
  const drawHistory = [
    ...(Array.isArray(harnessState.graphics.d3d8DrawHistory)
      ? harnessState.graphics.d3d8DrawHistory
      : []),
    drawHistoryEntry,
  ].slice(-64);
  const sceneDrawHistory = includeSceneDrawHistory
    ? [
        ...(Array.isArray(harnessState.graphics.d3d8SceneDrawHistory)
          ? harnessState.graphics.d3d8SceneDrawHistory
          : []),
        drawHistoryEntry,
      ].slice(-d3d8SceneDrawHistoryLimit)
    : (Array.isArray(harnessState.graphics.d3d8SceneDrawHistory)
        ? harnessState.graphics.d3d8SceneDrawHistory
        : []);
  harnessState.graphics = {
    ...harnessState.graphics,
    d3d8DrawIndexedSequence: drawSequence,
    d3d8DrawHistory: drawHistory,
    d3d8SceneDrawHistory: sceneDrawHistory,
    lastD3D8DrawIndexed: probe,
    d3d8Perf: d3d8PerfSummary(),
  };
  recordDrawPhase?.("sortedDrawTailMs");
  finishSortedDrawProfile?.();
  finishDrawProducerProfile?.();
  return drawOk ? 1 : 0;
}

  // The cncPortD3D8* engine hooks, ready to spread into the emscripten
  // Module config object (plus d3d8BridgeCallbacks() on window.CnCPort).
  const hooks = {
    cncPortD3D8ResetState: invalidateD3D8DrawStateCache,
    cncPortD3D8Present: presentD3D8Frame,
    cncPortD3D8Clear: paintD3D8Clear,
    cncPortD3D8SetViewport: setD3D8Viewport,
    cncPortD3D8SetGammaRamp: setD3D8GammaRamp,
    cncPortD3D8BackbufferResize: onD3D8BackbufferResize,
    cncPortD3D8NativeMode: d3d8NativeModeQuery,
    cncPortD3D8BufferCreate: createD3D8Buffer,
    cncPortD3D8BufferUpdate: updateD3D8Buffer,
    cncPortD3D8BufferRelease: releaseD3D8Buffer,
    cncPortD3D8TextureCreate: createD3D8Texture,
    cncPortD3D8TextureUpdate: updateD3D8Texture,
    cncPortD3D8VolumeTextureCreate: createD3D8VolumeTexture,
    cncPortD3D8VolumeTextureUpdate: updateD3D8VolumeTexture,
    cncPortD3D8TextureRelease: releaseD3D8Texture,
    cncPortD3D8TextureBind: bindD3D8Texture,
    cncPortD3D8TextureSampleCenter: sampleD3D8TextureCenter,
    cncPortD3D8BindFramebuffer: bindD3D8Framebuffer,
    cncPortD3D8DrawIndexed: paintD3D8DrawIndexed,
    cncPortD3D8ShaderTier: d3d8ShaderTierQuery,
    cncPortD3D8ShaderCreate: registerD3D8SM1Shader,
    cncPortD3D8ShaderDelete: deleteD3D8SM1Shader,
  };

  // Everything the harness (bridge.js RPC / snapshot / diagnostics surface)
  // still reads from executor internals. All members are stable bindings
  // (functions and const containers), safe to destructure once at startup;
  // mutable executor variables are exposed as getter functions.
  const diag = {
    clampNumber,
    clearCanvas,
    finiteNumber,
    flushD3D8PendingDrawBatch,
    invalidateCanvasDisplaySizeCache,
    normalizeD3D8Light,
    normalizeD3D8Material,
    normalizeRgba,
    pixelHasColor,
    pixelsApproximatelyEqual,
    roundedD3D8GammaMetric,
    sampleCanvasPixel,
    sampleCanvasRegion,
    sampleD3D8TexturePixel,
    d3d8TextureAlphaCoverage,
    d3d8TextureSupportsImplicitAlphaCutout,
    d3d8ImplicitAlphaCutoutThreshold,
    sampleVirtualCanvasPixel,
    syncCanvasSize,
    updateD3D8BufferSummary,
    viewportArraysEqual,
    updateD3D8TextureSummary,
    d3d8PerfSummary,
    beginD3D8GpuFrameTimer,
    endD3D8GpuFrameTimer,
    pollD3D8GpuFrameTimers,
    d3d8SM1ShaderAuditSummary,
    setD3D8SM1ShaderAuditEnabled,
    d3d8SceneDrawHistory: () =>
      Array.isArray(harnessState.graphics.d3d8SceneDrawHistory)
        ? harnessState.graphics.d3d8SceneDrawHistory
        : [],
    applyD3D8BoundDrawDiagnosticsLevel,
    d3dColorToNormalizedRgba,
    d3dMaterialSourceName,
    paintCanvasRgba,
    setD3D8ColorMask,
    setD3D8GammaRamp,
    onD3D8BackbufferResize,
    releaseD3D8ProbeBackingStore,
    sampleD3D8TextureCenter,
    materializeD3D8DrawPayload,
    bindD3D8ExternalFramebuffer,
    setD3D8XrViewOverride,
    computeD3D8XrClipTransform,
    invalidateD3D8DrawStateCache,
    invalidateD3D8ExternalGlState,
    d3d8Buffers,
    d3d8Textures,
    acquireD3D8DynamicRangeSlot,
    invalidateD3D8VertexArrayCacheForBufferId,
    rememberD3D8VertexArray,
    drainD3D8BufferRetirements,
    queueD3D8PendingDrawBatch,
    ensureD3D8DynamicRangeUploaded,
    ensureD3D8DynamicSharedBufferCurrent,
    retireD3D8BufferSlots,
    // mutable executor state, exposed as getters
    d3d8DiagLevelValue: () => d3d8DiagLevel,
    webglContextLost: () => webglContextLost,
    webglContextLossAt: () => webglContextLossAt,
    // loadWasmModule wires the wasm-side bound-draw-diagnostics cwrap here
    setBoundDrawDiagnosticsSetter: (fn) => { d3d8BoundDrawDiagnosticsSetter = fn; },
    // GL identities (same objects the harness realm sees on the main path)
    gl: () => gl,
    s3tc: () => s3tc,
    // D3D8 constants the RPC test-command surface builds payloads with
    D3D8_XYZNDUV_TEXCOORD0_OFFSET,
    D3D8_XYZNDUV_TEXCOORD_STRIDE,
    D3DBLEND_INVSRCALPHA,
    D3DBLEND_ONE,
    D3DBLEND_SRCALPHA,
    D3DBLEND_ZERO,
    D3DCMP_EQUAL,
    D3DCMP_LESS,
    D3DCOLORWRITEENABLE_BLUE,
    D3DCOLORWRITEENABLE_GREEN,
    D3DCOLORWRITEENABLE_RED,
    D3DCULL_CW,
    D3DFILL_WIREFRAME,
    D3DFMT_A4R4G4B4,
    D3DFMT_A8R8G8B8,
    D3DFMT_X8R8G8B8,
    D3DFOG_LINEAR,
    D3DFVF_DIFFUSE,
    D3DFVF_NORMAL,
    D3DFVF_SPECULAR,
    D3DFVF_TEX1,
    D3DFVF_XYZ,
    D3DLIGHT_DIRECTIONAL,
    D3DLIGHT_POINT,
    D3DLIGHT_SPOT,
    D3DMCS_COLOR1,
    D3DMCS_COLOR2,
    D3DMCS_MATERIAL,
    D3DPT_POINTLIST,
    D3DPT_TRIANGLELIST,
    D3DPT_TRIANGLESTRIP,
    D3DSHADE_FLAT,
    D3DTADDRESS_CLAMP,
    D3DTADDRESS_WRAP,
    D3DTA_ALPHAREPLICATE,
    D3DTA_CURRENT,
    D3DTA_DIFFUSE,
    D3DTA_TEXTURE,
    D3DTA_TFACTOR,
    D3DTEXF_LINEAR,
    D3DTEXF_NONE,
    D3DTEXF_POINT,
    D3DTOP_DISABLE,
    D3DTOP_DOTPRODUCT3,
    D3DTOP_MODULATE,
    D3DTOP_MULTIPLYADD,
    D3DTOP_SELECTARG1,
    D3DTSS_TCI_CAMERASPACENORMAL,
    D3DTSS_TCI_CAMERASPACEPOSITION,
    D3DTSS_TCI_CAMERASPACEREFLECTIONVECTOR,
    D3DTTFF_COUNT2,
    D3DTTFF_COUNT3,
    D3DTTFF_DISABLE,
    D3DTTFF_PROJECTED,
    D3DZB_TRUE,
    GL_GREEN,
  };

  return { hooks, diag };
}
