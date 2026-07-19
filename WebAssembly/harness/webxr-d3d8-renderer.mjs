import { createWebXrControls } from "./webxr-controls.mjs";

const D3DFVF_XYZRHW = 0x004;
const DEFAULT_ENGINE_UNITS_PER_METER = 1 / 0.3048; // Generals world coordinates are feet.

const ONCE_PER_FRAME_HOOKS = new Set([
  "cncPortD3D8ResetState",
  "cncPortD3D8SetGammaRamp",
  "cncPortD3D8BackbufferResize",
  "cncPortD3D8BufferCreate",
  "cncPortD3D8BufferUpdate",
  "cncPortD3D8BufferRelease",
  "cncPortD3D8TextureCreate",
  "cncPortD3D8TextureUpdate",
  "cncPortD3D8VolumeTextureCreate",
  "cncPortD3D8VolumeTextureUpdate",
  "cncPortD3D8TextureRelease",
  "cncPortD3D8TextureBind",
  "cncPortD3D8ShaderCreate",
  "cncPortD3D8ShaderDelete",
]);

function matrix16(value, label) {
  if (!value || typeof value.length !== "number" || value.length !== 16) {
    throw new TypeError(`${label} must contain 16 values`);
  }
  const result = new Float32Array(16);
  for (let index = 0; index < 16; index += 1) {
    const number = Number(value[index]);
    if (!Number.isFinite(number)) throw new TypeError(`${label} contains a non-finite value`);
    result[index] = number;
  }
  return result;
}

export function multiplyWebXrColumnMatrices(leftValue, rightValue) {
  const left = matrix16(leftValue, "left matrix");
  const right = matrix16(rightValue, "right matrix");
  const result = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let value = 0;
      for (let inner = 0; inner < 4; inner += 1) {
        value += left[inner * 4 + row] * right[column * 4 + inner];
      }
      result[column * 4 + row] = value;
    }
  }
  return result;
}

export function invertWebXrColumnMatrix(value) {
  const matrix = matrix16(value, "matrix to invert");
  const rows = Array.from({ length: 4 }, (_, row) => [
    matrix[row], matrix[4 + row], matrix[8 + row], matrix[12 + row],
    Number(row === 0), Number(row === 1), Number(row === 2), Number(row === 3),
  ]);
  for (let column = 0; column < 4; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < 4; row += 1) {
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    }
    if (Math.abs(rows[pivot][column]) < 1e-10) {
      throw new Error("WebXR matrix is singular");
    }
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const divisor = rows[column][column];
    for (let entry = 0; entry < 8; entry += 1) rows[column][entry] /= divisor;
    for (let row = 0; row < 4; row += 1) {
      if (row === column) continue;
      const factor = rows[row][column];
      for (let entry = 0; entry < 8; entry += 1) {
        rows[row][entry] -= factor * rows[column][entry];
      }
    }
  }
  const inverse = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) inverse[column * 4 + row] = rows[row][4 + column];
  }
  return inverse;
}

function transformWebXrColumnVector(matrixValue, vector) {
  const matrix = matrix16(matrixValue, "vector transform matrix");
  return [0, 1, 2, 3].map((row) => matrix[row] * vector[0]
    + matrix[4 + row] * vector[1]
    + matrix[8 + row] * vector[2]
    + matrix[12 + row] * vector[3]);
}

export function createWebXrEnginePickRay({
  targetRayMatrix,
  anchorTransform,
  engineViewMatrix,
  engineUnitsPerMeter = DEFAULT_ENGINE_UNITS_PER_METER,
  rayLengthEngineUnits = 12000,
} = {}) {
  const targetRay = matrix16(targetRayMatrix, "WebXR target ray matrix");
  const referenceToAnchor = invertWebXrColumnMatrix(anchorTransform);
  const cameraToWorld = invertWebXrColumnMatrix(engineViewMatrix);
  const unitsPerMeter = Number(engineUnitsPerMeter);
  const rayLength = Number(rayLengthEngineUnits);
  if (!Number.isFinite(unitsPerMeter) || unitsPerMeter <= 0
      || !Number.isFinite(rayLength) || rayLength <= 0) {
    throw new TypeError("WebXR engine pick ray requires positive scale and length");
  }
  const anchorOrigin = transformWebXrColumnVector(referenceToAnchor,
    [targetRay[12], targetRay[13], targetRay[14], 1]);
  const anchorDirection = transformWebXrColumnVector(referenceToAnchor,
    [-targetRay[8], -targetRay[9], -targetRay[10], 0]);
  const viewOrigin = [
    anchorOrigin[0] * unitsPerMeter,
    anchorOrigin[1] * unitsPerMeter,
    -anchorOrigin[2] * unitsPerMeter,
    1,
  ];
  const viewDirection = [
    anchorDirection[0] * unitsPerMeter,
    anchorDirection[1] * unitsPerMeter,
    -anchorDirection[2] * unitsPerMeter,
    0,
  ];
  const worldOrigin4 = transformWebXrColumnVector(cameraToWorld, viewOrigin);
  const worldDirection4 = transformWebXrColumnVector(cameraToWorld, viewDirection);
  const worldDirectionLength = Math.hypot(
    worldDirection4[0], worldDirection4[1], worldDirection4[2],
  );
  if (!(worldDirectionLength > 1e-8)) throw new Error("WebXR engine pick ray has no direction");
  const origin = worldOrigin4.slice(0, 3);
  const direction = worldDirection4.slice(0, 3)
    .map((component) => component / worldDirectionLength);
  return {
    origin,
    end: origin.map((component, index) => component + direction[index] * rayLength),
  };
}

export function convertWebXrProjectionToD3DDepth(projectionValue) {
  const projection = matrix16(projectionValue, "WebXR projection matrix");
  // The shared D3D shader converts [0,w] depth to WebGL [-w,w] with
  // z' = 2z-w. Feed it (WebXR z+w)/2 so the final clip position is exactly
  // the runtime-provided projection, including asymmetric per-eye frusta.
  for (let column = 0; column < 4; column += 1) {
    const z = column * 4 + 2;
    const w = column * 4 + 3;
    projection[z] = (projection[z] + projection[w]) * 0.5;
  }
  return projection;
}

export function createWebXrD3D8ViewOverride({
  anchorTransform,
  view,
  engineUnitsPerMeter = DEFAULT_ENGINE_UNITS_PER_METER,
  framebufferWidth,
  framebufferHeight,
} = {}) {
  const eyeView = matrix16(view?.viewMatrix, "WebXR eye view matrix");
  const anchor = matrix16(anchorTransform, "WebXR anchor transform");
  const unitsPerMeter = Number(engineUnitsPerMeter);
  if (!Number.isFinite(unitsPerMeter) || unitsPerMeter <= 0) {
    throw new TypeError("engineUnitsPerMeter must be positive");
  }
  const metersPerEngineUnit = 1 / unitsPerMeter;
  // D3D view space is left-handed (+Z forward); WebXR is right-handed (-Z
  // forward). Scale feet to meters while reflecting Z into WebXR space.
  const engineCameraToAnchor = new Float32Array([
    metersPerEngineUnit, 0, 0, 0,
    0, metersPerEngineUnit, 0, 0,
    0, 0, -metersPerEngineUnit, 0,
    0, 0, 0, 1,
  ]);
  const anchorRelativeEyeView = multiplyWebXrColumnMatrices(eyeView, anchor);
  const viewPrefix = multiplyWebXrColumnMatrices(anchorRelativeEyeView, engineCameraToAnchor);
  const viewport = view?.viewport;
  if (!viewport || !(Number(viewport.width) > 0) || !(Number(viewport.height) > 0)) {
    throw new TypeError("WebXR view requires a positive compositor viewport");
  }
  return {
    viewPrefix,
    projection: convertWebXrProjectionToD3DDepth(view.projectionMatrix),
    viewport: {
      x: Number(viewport.x) >>> 0,
      y: Number(viewport.y) >>> 0,
      width: Number(viewport.width) >>> 0,
      height: Number(viewport.height) >>> 0,
    },
    targetWidth: Number(framebufferWidth) >>> 0,
    targetHeight: Number(framebufferHeight) >>> 0,
  };
}

function pretransformedDraw(payload) {
  return ((Number(payload?.vertexShaderFvf ?? 0) >>> 0) & D3DFVF_XYZRHW) === D3DFVF_XYZRHW;
}

function engineViewFromPacket(packet) {
  let defaultFramebuffer = true;
  for (const command of packet?.commands ?? []) {
    if (command.hook === "cncPortD3D8BindFramebuffer") {
      defaultFramebuffer = (Number(command.args?.[0]?.colorTextureId ?? 0) >>> 0) === 0;
      continue;
    }
    const payload = command.hook === "cncPortD3D8DrawIndexed" ? command.args?.[0] : null;
    if (defaultFramebuffer && payload && !pretransformedDraw(payload)
        && ((Number(payload.transformMask ?? 0) >>> 0) & 2) !== 0
        && payload.transforms?.view) {
      return matrix16(payload.transforms.view, "engine view transform");
    }
  }
  return null;
}

function callHook(executorHooks, command) {
  const hook = executorHooks?.[command?.hook];
  if (typeof hook !== "function") {
    throw new Error(`native WebXR renderer does not implement ${command?.hook}`);
  }
  return hook(...(Array.isArray(command.args) ? command.args : []));
}

function clearCompositorViews(gl, views, args, invalidateState) {
  const [flagsValue, red, green, blue, alpha, depth, stencil] = args;
  const flags = Number(flagsValue) >>> 0;
  let bits = 0;
  if ((flags & 0x1) !== 0) {
    gl.colorMask(true, true, true, true);
    gl.clearColor(Number(red) / 255, Number(green) / 255, Number(blue) / 255, Number(alpha) / 255);
    bits |= gl.COLOR_BUFFER_BIT;
  }
  if ((flags & 0x2) !== 0) {
    gl.depthMask(true);
    gl.clearDepth(Number(depth));
    bits |= gl.DEPTH_BUFFER_BIT;
  }
  if ((flags & 0x4) !== 0 && gl.getContextAttributes?.().stencil) {
    gl.stencilMask(0xffffffff);
    gl.clearStencil(Number(stencil) >>> 0);
    bits |= gl.STENCIL_BUFFER_BIT;
  }
  if (bits === 0) return;
  gl.enable(gl.SCISSOR_TEST);
  for (const { viewport } of views) {
    gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
    gl.scissor(viewport.x, viewport.y, viewport.width, viewport.height);
    gl.clear(bits);
  }
  invalidateState();
}

function createUiSurface(gl) {
  let width = 0;
  let height = 0;
  const texture = gl.createTexture();
  const framebuffer = gl.createFramebuffer();
  const depthStencil = gl.createRenderbuffer();
  if (!texture || !framebuffer || !depthStencil) {
    throw new Error("could not allocate the WebXR spatial UI surface");
  }
  return {
    texture,
    framebuffer,
    depthStencil,
    resize(nextWidth, nextHeight) {
      const w = Math.max(1, Number(nextWidth) >>> 0);
      const h = Math.max(1, Number(nextHeight) >>> 0);
      if (w === width && h === height) return;
      width = w;
      height = h;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA,
        gl.UNSIGNED_BYTE, null);
      gl.bindRenderbuffer(gl.RENDERBUFFER, depthStencil);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, width, height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT,
        gl.RENDERBUFFER, depthStencil);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error("WebXR spatial UI framebuffer is incomplete");
      }
    },
    get width() { return width; },
    get height() { return height; },
  };
}

function compileWebXrShader(gl, type, source, label) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`${label} shader failed: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

function compileUiProgram(gl) {
  const vertex = compileWebXrShader(gl, gl.VERTEX_SHADER, `#version 300 es
    in vec2 aPosition;
    in vec2 aUv;
    uniform mat4 uMvp;
    out vec2 vUv;
    void main() {
      gl_Position = uMvp * vec4(aPosition, 0.0, 1.0);
      vUv = aUv;
    }
  `, "WebXR UI vertex");
  const fragment = compileWebXrShader(gl, gl.FRAGMENT_SHADER, `#version 300 es
    precision highp float;
    in vec2 vUv;
    uniform sampler2D uTexture;
    out vec4 fragColor;
    void main() {
      fragColor = texture(uTexture, vUv);
    }
  `, "WebXR UI fragment");
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`WebXR UI program failed: ${gl.getProgramInfoLog(program)}`);
  }
  const vertexArray = gl.createVertexArray();
  const buffer = gl.createBuffer();
  gl.bindVertexArray(vertexArray);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -0.5, -0.5, 0, 0,
     0.5, -0.5, 1, 0,
    -0.5,  0.5, 0, 1,
     0.5,  0.5, 1, 1,
  ]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "aPosition");
  const uv = gl.getAttribLocation(program, "aUv");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(uv);
  gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 16, 8);
  return {
    program,
    vertexArray,
    mvp: gl.getUniformLocation(program, "uMvp"),
    texture: gl.getUniformLocation(program, "uTexture"),
  };
}

function compilePointerProgram(gl) {
  const vertex = compileWebXrShader(gl, gl.VERTEX_SHADER, `#version 300 es
    in vec3 aPosition;
    uniform mat4 uMvp;
    uniform float uPointSize;
    void main() {
      gl_Position = uMvp * vec4(aPosition, 1.0);
      gl_PointSize = uPointSize;
    }
  `, "WebXR pointer vertex");
  const fragment = compileWebXrShader(gl, gl.FRAGMENT_SHADER, `#version 300 es
    precision highp float;
    uniform vec4 uColor;
    uniform float uPoint;
    out vec4 fragColor;
    void main() {
      if (uPoint > 0.5 && distance(gl_PointCoord, vec2(0.5)) > 0.5) discard;
      fragColor = uColor;
    }
  `, "WebXR pointer fragment");
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`WebXR pointer program failed: ${gl.getProgramInfoLog(program)}`);
  }
  const vertexArray = gl.createVertexArray();
  const buffer = gl.createBuffer();
  gl.bindVertexArray(vertexArray);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, Float32Array.BYTES_PER_ELEMENT * 6, gl.DYNAMIC_DRAW);
  const position = gl.getAttribLocation(program, "aPosition");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 12, 0);
  return {
    program,
    vertexArray,
    buffer,
    mvp: gl.getUniformLocation(program, "uMvp"),
    color: gl.getUniformLocation(program, "uColor"),
    point: gl.getUniformLocation(program, "uPoint"),
    pointSize: gl.getUniformLocation(program, "uPointSize"),
  };
}

function renderSpatialUi({
  gl,
  uiSurface,
  uiProgram,
  views,
  anchorTransform,
  panelWidth,
  panelDistance,
}) {
  const aspect = uiSurface.width / uiSurface.height;
  const model = new Float32Array([
    panelWidth, 0, 0, 0,
    0, panelWidth / aspect, 0, 0,
    0, 0, 1, 0,
    0, 0, -panelDistance, 1,
  ]);
  gl.useProgram(uiProgram.program);
  gl.bindVertexArray(uiProgram.vertexArray);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, uiSurface.texture);
  gl.uniform1i(uiProgram.texture, 0);
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  for (const view of views) {
    gl.viewport(view.viewport.x, view.viewport.y, view.viewport.width, view.viewport.height);
    gl.scissor(view.viewport.x, view.viewport.y, view.viewport.width, view.viewport.height);
    const viewAnchor = multiplyWebXrColumnMatrices(view.viewMatrix, anchorTransform);
    const viewModel = multiplyWebXrColumnMatrices(viewAnchor, model);
    const mvp = multiplyWebXrColumnMatrices(view.projectionMatrix, viewModel);
    gl.uniformMatrix4fv(uiProgram.mvp, false, mvp);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

function renderSpatialPointer({ gl, pointerProgram, views, pointer }) {
  const origin = Array.from(pointer?.spatialRay?.origin ?? [], Number);
  const end = Array.from(pointer?.spatialRay?.end ?? [], Number);
  if (origin.length !== 3 || end.length !== 3
      || !origin.every(Number.isFinite) || !end.every(Number.isFinite)) return 0;
  const color = pointer.pressed ? [1, 0.95, 0.75, 1]
    : pointer.target === "ui" ? [1, 0.2, 0.85, 0.92]
      : [1, 0.58, 0.12, 0.92];
  gl.useProgram(pointerProgram.program);
  gl.bindVertexArray(pointerProgram.vertexArray);
  gl.bindBuffer(gl.ARRAY_BUFFER, pointerProgram.buffer);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array([...origin, ...end]));
  gl.uniform4fv(pointerProgram.color, color);
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.lineWidth(2);
  for (const view of views) {
    gl.viewport(view.viewport.x, view.viewport.y, view.viewport.width, view.viewport.height);
    gl.scissor(view.viewport.x, view.viewport.y, view.viewport.width, view.viewport.height);
    const mvp = multiplyWebXrColumnMatrices(view.projectionMatrix, view.viewMatrix);
    gl.uniformMatrix4fv(pointerProgram.mvp, false, mvp);
    gl.uniform1f(pointerProgram.point, 0);
    gl.uniform1f(pointerProgram.pointSize, 1);
    gl.drawArrays(gl.LINES, 0, 2);
    if (pointer.target === "ui") {
      gl.uniform1f(pointerProgram.point, 1);
      gl.uniform1f(pointerProgram.pointSize, pointer.pressed ? 18 : 14);
      gl.drawArrays(gl.POINTS, 1, 1);
    }
  }
  return views.length;
}

export function createWebXrD3D8Renderer({
  gl,
  executorHooks,
  executorDiag,
  engineUnitsPerMeter = DEFAULT_ENGINE_UNITS_PER_METER,
  worldScale = 1,
  panelWidthMeters = 1.6,
  panelDistanceMeters = 1.5,
  heightOffsetMeters = 0,
  controlOptions = null,
  onInputAction = null,
  onStateChange = null,
} = {}) {
  if (!gl || typeof gl.bindFramebuffer !== "function") {
    throw new TypeError("native WebXR D3D8 renderer requires WebGL2");
  }
  for (const name of [
    "bindD3D8ExternalFramebuffer",
    "setD3D8XrViewOverride",
    "invalidateD3D8ExternalGlState",
    "flushD3D8PendingDrawBatch",
  ]) {
    if (typeof executorDiag?.[name] !== "function") {
      throw new TypeError(`native WebXR D3D8 renderer requires executor ${name}`);
    }
  }
  const configuredWorldScale = Number(worldScale);
  const configuredHeightOffset = Number(heightOffsetMeters);
  const configuredEngineUnitsPerMeter = Number(engineUnitsPerMeter);
  const configuredPanelWidth = Number(panelWidthMeters);
  const configuredPanelDistance = Number(panelDistanceMeters);
  if (!Number.isFinite(configuredWorldScale) || configuredWorldScale <= 0
      || !Number.isFinite(configuredEngineUnitsPerMeter)
      || configuredEngineUnitsPerMeter <= 0) {
    throw new TypeError("native WebXR renderer requires positive world scale");
  }
  if (!Number.isFinite(configuredPanelWidth) || configuredPanelWidth <= 0
      || !Number.isFinite(configuredPanelDistance) || configuredPanelDistance <= 0) {
    throw new TypeError("native WebXR renderer requires positive panel geometry");
  }
  if (!Number.isFinite(configuredHeightOffset)) {
    throw new TypeError("native WebXR renderer requires a finite height offset");
  }
  const scaledEngineUnitsPerMeter = configuredEngineUnitsPerMeter / configuredWorldScale;
  const anchoredViewerTransform = (pose, label) => {
    const transform = matrix16(pose?.transform?.matrix, label);
    transform[13] += configuredHeightOffset;
    return transform;
  };
  let active = false;
  let anchorTransform = null;
  let pending = null;
  let uiSurface = null;
  let uiProgram = null;
  let pointerProgram = null;
  let lastBackbufferWidth = 0;
  let lastBackbufferHeight = 0;
  let recenterRequested = false;
  let latestEngineView = null;
  const controls = createWebXrControls({
    ...(controlOptions ?? {}),
    onAction: (action) => {
      if (action.type === "recenter") {
        recenterRequested = true;
        return;
      }
      onInputAction?.(action);
    },
  });
  let state = {
    active: false,
    frames: 0,
    sequence: 0,
    viewCount: 0,
    worldDraws: 0,
    uiDraws: 0,
    pointerDraws: 0,
    inputSourceCount: 0,
    controllerPointer: null,
    enginePickRayReady: false,
    recenterCount: 0,
    comfort: {
      worldScale: configuredWorldScale,
      panelWidthMeters: configuredPanelWidth,
      panelDistanceMeters: configuredPanelDistance,
      heightOffsetMeters: configuredHeightOffset,
      dominantHand: controls.snapshot().dominantHand,
      stickDeadzone: controls.snapshot().pressThreshold,
      stickReleaseThreshold: controls.snapshot().releaseThreshold,
    },
    error: null,
  };

  const publish = (patch) => {
    state = { ...state, ...patch };
    onStateChange?.({ ...state });
    return { ...state };
  };

  function acceptFrame(packet, completion) {
    if (!active || pending || !packet || typeof completion !== "function") return false;
    latestEngineView = engineViewFromPacket(packet) ?? latestEngineView;
    pending = { packet, completion };
    return true;
  }

  function finishPending(accepted) {
    const current = pending;
    pending = null;
    current?.completion(accepted === true);
  }

  function renderFrame(frameContext) {
    if (!active) return;
    const views = Array.isArray(frameContext.views) ? frameContext.views : [];
    if (views.length === 0) throw new Error("WebXR compositor provided no views");
    anchorTransform ??= anchoredViewerTransform(frameContext.pose, "initial viewer transform");
    if (recenterRequested) {
      anchorTransform = anchoredViewerTransform(frameContext.pose, "recenter viewer transform");
      recenterRequested = false;
      state = { ...state, recenterCount: state.recenterCount + 1 };
    }
    if (pending) {
      lastBackbufferWidth = Number(pending.packet.present?.backBufferWidth ?? 1280) >>> 0;
      lastBackbufferHeight = Number(pending.packet.present?.backBufferHeight ?? 720) >>> 0;
    }
    if (lastBackbufferWidth > 0 && lastBackbufferHeight > 0) {
      const panelWidth = configuredPanelWidth;
      const panelHeight = panelWidth * lastBackbufferHeight / lastBackbufferWidth;
      const controlsState = controls.update({
        time: frameContext.time,
        inputSources: frameContext.inputSources,
        anchorTransform,
        panelWidthMeters: panelWidth,
        panelHeightMeters: panelHeight,
        panelDistanceMeters: configuredPanelDistance,
        backbufferWidth: lastBackbufferWidth,
        backbufferHeight: lastBackbufferHeight,
        resolveWorldRay: latestEngineView
          ? (targetRayMatrix) => createWebXrEnginePickRay({
              targetRayMatrix,
              anchorTransform,
              engineViewMatrix: latestEngineView,
              engineUnitsPerMeter: scaledEngineUnitsPerMeter,
            })
          : null,
      });
      state = {
        ...state,
        inputSourceCount: Number(frameContext.inputSources?.length ?? 0),
        controllerPointer: controlsState.pointer,
        enginePickRayReady: latestEngineView !== null,
      };
    }
    if (!pending) return;
    const { packet } = pending;
    const framebufferWidth = Number(frameContext.layer?.framebufferWidth ?? gl.drawingBufferWidth) >>> 0;
    const framebufferHeight = Number(frameContext.layer?.framebufferHeight ?? gl.drawingBufferHeight) >>> 0;
    const xrFramebuffer = frameContext.layer?.framebuffer;
    const overrides = views.map((view) => createWebXrD3D8ViewOverride({
      anchorTransform,
      view,
      engineUnitsPerMeter: scaledEngineUnitsPerMeter,
      framebufferWidth,
      framebufferHeight,
    }));
    const backbufferWidth = lastBackbufferWidth;
    const backbufferHeight = lastBackbufferHeight;
    let defaultFramebuffer = true;
    let defaultViewportArgs = [{
      x: 0,
      y: 0,
      width: backbufferWidth,
      height: backbufferHeight,
      targetWidth: backbufferWidth,
      targetHeight: backbufferHeight,
      minZ: 0,
      maxZ: 1,
    }];
    let worldDraws = 0;
    let uiDraws = 0;

    try {
      for (const command of packet.commands ?? []) {
        if (ONCE_PER_FRAME_HOOKS.has(command.hook)) {
          callHook(executorHooks, command);
          continue;
        }
        if (command.hook === "cncPortD3D8BindFramebuffer") {
          const payload = command.args?.[0] ?? {};
          defaultFramebuffer = (Number(payload.colorTextureId ?? 0) >>> 0) === 0;
          executorDiag.setD3D8XrViewOverride(null);
          if (!defaultFramebuffer) callHook(executorHooks, command);
          continue;
        }
        if (command.hook === "cncPortD3D8SetViewport") {
          if (defaultFramebuffer) defaultViewportArgs = command.args;
          else callHook(executorHooks, command);
          continue;
        }
        if (command.hook === "cncPortD3D8Clear") {
          if (defaultFramebuffer) {
            executorDiag.bindD3D8ExternalFramebuffer(
              xrFramebuffer, framebufferWidth, framebufferHeight,
            );
            clearCompositorViews(gl, views, command.args ?? [],
              executorDiag.invalidateD3D8ExternalGlState);
          } else {
            callHook(executorHooks, command);
          }
          continue;
        }
        if (command.hook === "cncPortD3D8DrawIndexed") {
          if (!defaultFramebuffer) {
            executorDiag.setD3D8XrViewOverride(null);
            callHook(executorHooks, command);
          } else if (pretransformedDraw(command.args?.[0])) {
            uiSurface ??= createUiSurface(gl);
            uiSurface.resize(backbufferWidth, backbufferHeight);
            if (uiDraws === 0) {
              executorDiag.bindD3D8ExternalFramebuffer(
                uiSurface.framebuffer, uiSurface.width, uiSurface.height,
              );
              gl.viewport(0, 0, uiSurface.width, uiSurface.height);
              gl.scissor(0, 0, uiSurface.width, uiSurface.height);
              gl.colorMask(true, true, true, true);
              gl.depthMask(true);
              gl.stencilMask(0xffffffff);
              gl.clearColor(0, 0, 0, 0);
              gl.clearDepth(1);
              gl.clearStencil(0);
              gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
              executorDiag.invalidateD3D8ExternalGlState();
            } else {
              executorDiag.bindD3D8ExternalFramebuffer(
                uiSurface.framebuffer, uiSurface.width, uiSurface.height,
              );
            }
            executorDiag.setD3D8XrViewOverride(null);
            executorHooks.cncPortD3D8SetViewport(...defaultViewportArgs);
            callHook(executorHooks, command);
            uiDraws += 1;
          } else {
            for (const override of overrides) {
              executorDiag.bindD3D8ExternalFramebuffer(
                xrFramebuffer, framebufferWidth, framebufferHeight,
              );
              executorDiag.setD3D8XrViewOverride(override);
              callHook(executorHooks, command);
              worldDraws += 1;
            }
          }
          continue;
        }
        if (command.hook !== "cncPortD3D8Present") {
          throw new Error(`native WebXR renderer cannot route ${command.hook}`);
        }
      }
      executorDiag.setD3D8XrViewOverride(null);
      executorDiag.flushD3D8PendingDrawBatch("webxrPresent");
      if (uiDraws > 0) {
        executorDiag.bindD3D8ExternalFramebuffer(xrFramebuffer, framebufferWidth, framebufferHeight);
        uiProgram ??= compileUiProgram(gl);
        renderSpatialUi({
          gl,
          uiSurface,
          uiProgram,
          views,
          anchorTransform,
          panelWidth: configuredPanelWidth,
          panelDistance: configuredPanelDistance,
        });
        executorDiag.invalidateD3D8ExternalGlState();
      }
      const pointer = controls.snapshot().pointer;
      let pointerDraws = 0;
      if (pointer?.spatialRay) {
        executorDiag.bindD3D8ExternalFramebuffer(xrFramebuffer, framebufferWidth, framebufferHeight);
        pointerProgram ??= compilePointerProgram(gl);
        pointerDraws = renderSpatialPointer({ gl, pointerProgram, views, pointer });
        executorDiag.invalidateD3D8ExternalGlState();
      }
      publish({
        frames: state.frames + 1,
        sequence: packet.sequence,
        viewCount: views.length,
        worldDraws,
        uiDraws,
        pointerDraws,
        inputSourceCount: Number(frameContext.inputSources?.length ?? 0),
        controllerPointer: controls.snapshot().pointer,
        error: null,
      });
      finishPending(true);
    } catch (error) {
      publish({ error: error?.message ?? String(error) });
      finishPending(false);
      throw error;
    }
  }

  function onSessionStart() {
    active = true;
    anchorTransform = null;
    recenterRequested = false;
    latestEngineView = null;
    onInputAction?.({ type: "pickRay", ray: null });
    return publish({ active: true, enginePickRayReady: false, error: null });
  }

  function onSessionEnd() {
    active = false;
    anchorTransform = null;
    recenterRequested = false;
    controls.reset();
    onInputAction?.({ type: "pickRay", ray: null });
    latestEngineView = null;
    finishPending(false);
    executorDiag.setD3D8XrViewOverride(null);
    return publish({ active: false, inputSourceCount: 0, controllerPointer: null,
      enginePickRayReady: false, pointerDraws: 0 });
  }

  return {
    gl,
    acceptFrame,
    renderFrame,
    onSessionStart,
    onSessionEnd,
    getControlsState: () => controls.snapshot(),
    snapshot: () => ({ ...state }),
    get active() { return active; },
  };
}

export const WEBXR_D3D8_ENGINE_UNITS_PER_METER = DEFAULT_ENGINE_UNITS_PER_METER;
