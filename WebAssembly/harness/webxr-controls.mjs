const PRESS_THRESHOLD = 0.55;
const RELEASE_THRESHOLD = 0.35;
const STICK_REPEAT_MS = 180;

function matrix16(value, label) {
  if (!value || typeof value.length !== "number" || value.length !== 16) {
    throw new TypeError(`${label} must contain 16 values`);
  }
  return value;
}

function finitePositive(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new TypeError(`${label} must be positive`);
  }
  return number;
}

function transformReferencePointToAnchor(point, anchor) {
  const dx = point[0] - anchor[12];
  const dy = point[1] - anchor[13];
  const dz = point[2] - anchor[14];
  return [
    anchor[0] * dx + anchor[1] * dy + anchor[2] * dz,
    anchor[4] * dx + anchor[5] * dy + anchor[6] * dz,
    anchor[8] * dx + anchor[9] * dy + anchor[10] * dz,
  ];
}

function transformReferenceVectorToAnchor(vector, anchor) {
  return [
    anchor[0] * vector[0] + anchor[1] * vector[1] + anchor[2] * vector[2],
    anchor[4] * vector[0] + anchor[5] * vector[1] + anchor[6] * vector[2],
    anchor[8] * vector[0] + anchor[9] * vector[1] + anchor[10] * vector[2],
  ];
}

export function intersectWebXrRayWithPanel({
  targetRayMatrix,
  anchorTransform,
  panelWidthMeters,
  panelHeightMeters,
  panelDistanceMeters,
  backbufferWidth,
  backbufferHeight,
} = {}) {
  const ray = matrix16(targetRayMatrix, "target ray matrix");
  const anchor = matrix16(anchorTransform, "panel anchor transform");
  const width = finitePositive(panelWidthMeters, "panel width");
  const height = finitePositive(panelHeightMeters, "panel height");
  const distance = finitePositive(panelDistanceMeters, "panel distance");
  const pixelWidth = finitePositive(backbufferWidth, "backbuffer width");
  const pixelHeight = finitePositive(backbufferHeight, "backbuffer height");
  const origin = transformReferencePointToAnchor([ray[12], ray[13], ray[14]], anchor);
  // A WebXR target ray points down its local -Z axis.
  const direction = transformReferenceVectorToAnchor([-ray[8], -ray[9], -ray[10]], anchor);
  if (Math.abs(direction[2]) < 1e-6) return null;
  const t = (-distance - origin[2]) / direction[2];
  if (!(t > 0)) return null;
  const x = origin[0] + direction[0] * t;
  const y = origin[1] + direction[1] * t;
  const u = x / width + 0.5;
  const v = 0.5 - y / height;
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  return {
    u,
    v,
    distanceMeters: t,
    point: {
      x: Math.max(0, Math.min(pixelWidth - 1, Math.round(u * (pixelWidth - 1)))),
      y: Math.max(0, Math.min(pixelHeight - 1, Math.round(v * (pixelHeight - 1)))),
    },
  };
}

function pressed(button) {
  return button?.pressed === true || Number(button?.value ?? 0) >= PRESS_THRESHOLD;
}

function primaryAxes(gamepad) {
  const axes = Array.from(gamepad?.axes ?? [], Number);
  if (axes.length < 2) return [0, 0];
  return axes.slice(-2).map((value) => Number.isFinite(value) ? value : 0);
}

function sourceKey(source) {
  return `${source?.id ?? source?.index ?? "unknown"}:${source?.handedness ?? "none"}`;
}

function desiredAxisState(value, negativeCode, positiveCode, previous) {
  if (previous === negativeCode && value <= -RELEASE_THRESHOLD) return negativeCode;
  if (previous === positiveCode && value >= RELEASE_THRESHOLD) return positiveCode;
  if (value <= -PRESS_THRESHOLD) return negativeCode;
  if (value >= PRESS_THRESHOLD) return positiveCode;
  return null;
}

export function createWebXrControls({ onAction = null } = {}) {
  const sources = new Map();
  let pointer = null;

  const emit = (action) => onAction?.(action);

  function setKey(sourceState, slot, code) {
    const previous = sourceState[slot];
    if (previous === code) return;
    if (previous) emit({ type: "key", code: previous, down: false });
    sourceState[slot] = code;
    if (code) emit({ type: "key", code, down: true });
  }

  function releaseSource(sourceState) {
    if (sourceState.primaryDown) {
      emit({ type: "button", button: "primary", down: false, point: sourceState.lastPoint });
    }
    if (sourceState.secondaryDown) {
      emit({ type: "button", button: "secondary", down: false, point: sourceState.lastPoint });
    }
    setKey(sourceState, "horizontalKey", null);
    setKey(sourceState, "verticalKey", null);
  }

  function update({
    time = 0,
    inputSources = [],
    anchorTransform,
    panelWidthMeters,
    panelHeightMeters,
    panelDistanceMeters,
    backbufferWidth,
    backbufferHeight,
  } = {}) {
    const seen = new Set();
    const hits = [];
    for (const source of inputSources) {
      const key = sourceKey(source);
      seen.add(key);
      let sourceState = sources.get(key);
      if (!sourceState) {
        sourceState = {
          horizontalKey: null,
          verticalKey: null,
          primaryDown: false,
          secondaryDown: false,
          escapeDown: false,
          recenterDown: false,
          lastPoint: null,
          stickDirection: 0,
          nextStickRepeat: 0,
        };
        sources.set(key, sourceState);
      }

      const hit = source?.targetRayPose?.matrix
        ? intersectWebXrRayWithPanel({
          targetRayMatrix: source.targetRayPose.matrix,
          anchorTransform,
          panelWidthMeters,
          panelHeightMeters,
          panelDistanceMeters,
          backbufferWidth,
          backbufferHeight,
        })
        : null;
      if (hit) {
        sourceState.lastPoint = hit.point;
        hits.push({ source, hit, trigger: pressed(source?.gamepad?.buttons?.[0]) });
      }

      const buttons = source?.gamepad?.buttons ?? [];
      const trigger = pressed(buttons[0]);
      const squeeze = pressed(buttons[1]);
      const primaryDown = trigger && Boolean(hit);
      const secondaryDown = squeeze && Boolean(sourceState.lastPoint);
      if (primaryDown !== sourceState.primaryDown) {
        emit({ type: "button", button: "primary", down: primaryDown,
          point: hit?.point ?? sourceState.lastPoint });
        sourceState.primaryDown = primaryDown;
      }
      if (secondaryDown !== sourceState.secondaryDown) {
        emit({ type: "button", button: "secondary", down: secondaryDown,
          point: hit?.point ?? sourceState.lastPoint });
        sourceState.secondaryDown = secondaryDown;
      }

      const escapeDown = pressed(buttons[4]);
      if (escapeDown && !sourceState.escapeDown) {
        emit({ type: "key", code: "Escape", down: true });
        emit({ type: "key", code: "Escape", down: false });
      }
      sourceState.escapeDown = escapeDown;
      const recenterDown = pressed(buttons[5]);
      if (recenterDown && !sourceState.recenterDown) emit({ type: "recenter" });
      sourceState.recenterDown = recenterDown;

      const [axisX, axisY] = primaryAxes(source?.gamepad);
      if (source?.handedness === "left") {
        setKey(sourceState, "horizontalKey",
          desiredAxisState(axisX, "ArrowLeft", "ArrowRight", sourceState.horizontalKey));
        setKey(sourceState, "verticalKey",
          desiredAxisState(axisY, "ArrowUp", "ArrowDown", sourceState.verticalKey));
      } else {
        const direction = axisY <= -PRESS_THRESHOLD ? 1 : axisY >= PRESS_THRESHOLD ? -1 : 0;
        if (direction === 0) {
          sourceState.stickDirection = 0;
        } else if (direction !== sourceState.stickDirection || Number(time) >= sourceState.nextStickRepeat) {
          emit({ type: "wheel", steps: direction, point: hit?.point ?? sourceState.lastPoint });
          sourceState.stickDirection = direction;
          sourceState.nextStickRepeat = Number(time) + STICK_REPEAT_MS;
        }
      }
    }

    for (const [key, sourceState] of sources) {
      if (seen.has(key)) continue;
      releaseSource(sourceState);
      sources.delete(key);
    }

    hits.sort((left, right) => Number(right.trigger) - Number(left.trigger)
      || Number(right.source?.handedness === "right") - Number(left.source?.handedness === "right"));
    const activeHit = hits[0] ?? null;
    pointer = activeHit ? {
      handedness: activeHit.source?.handedness ?? "none",
      point: { ...activeHit.hit.point },
      u: activeHit.hit.u,
      v: activeHit.hit.v,
    } : null;
    if (pointer) emit({ type: "pointer", point: pointer.point, handedness: pointer.handedness });
    return snapshot();
  }

  function reset() {
    for (const sourceState of sources.values()) releaseSource(sourceState);
    sources.clear();
    pointer = null;
  }

  function snapshot() {
    return {
      sourceCount: sources.size,
      pointer: pointer ? { ...pointer, point: { ...pointer.point } } : null,
    };
  }

  return { update, reset, snapshot };
}
