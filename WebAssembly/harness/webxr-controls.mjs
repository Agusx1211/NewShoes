const PRESS_THRESHOLD = 0.55;
const RELEASE_THRESHOLD = 0.35;

export const DEFAULT_WEBXR_CONTROL_BINDINGS = Object.freeze({
  dominantHand: "right",
  buttons: Object.freeze({
    trigger: 0,
    squeeze: 1,
    auxiliary: 2,
    thumbstick: 3,
    primaryAction: 4,
    secondaryAction: 5,
  }),
  keys: Object.freeze({
    attackMove: "KeyA",
    cancel: "Escape",
    panLeft: "ArrowLeft",
    panRight: "ArrowRight",
    panUp: "ArrowUp",
    panDown: "ArrowDown",
    rotateLeft: "Numpad4",
    rotateRight: "Numpad6",
    zoomIn: "Numpad8",
    zoomOut: "Numpad2",
  }),
});

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

function pressed(button, threshold) {
  return button?.pressed === true || Number(button?.value ?? 0) >= threshold;
}

function primaryAxes(gamepad) {
  const axes = Array.from(gamepad?.axes ?? [], Number);
  if (axes.length < 2) return [0, 0];
  return axes.slice(-2).map((value) => Number.isFinite(value) ? value : 0);
}

function desiredAxisState(value, negativeCode, positiveCode, previous,
  pressThreshold, releaseThreshold) {
  if (previous === negativeCode && value <= -releaseThreshold) return negativeCode;
  if (previous === positiveCode && value >= releaseThreshold) return positiveCode;
  if (value <= -pressThreshold) return negativeCode;
  if (value >= pressThreshold) return positiveCode;
  return null;
}

function finiteThreshold(value, fallback, label) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(number) || number <= 0 || number >= 1) {
    throw new TypeError(`${label} must be between zero and one`);
  }
  return number;
}

function bindingIndex(value, fallback, label) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new TypeError(`${label} must be a non-negative integer`);
  }
  return number;
}

function webXrControlConfig({ bindings = {}, pressThreshold, releaseThreshold } = {}) {
  const dominantHand = bindings.dominantHand ?? DEFAULT_WEBXR_CONTROL_BINDINGS.dominantHand;
  if (dominantHand !== "left" && dominantHand !== "right") {
    throw new TypeError("WebXR dominant hand must be left or right");
  }
  const configuredPress = finiteThreshold(pressThreshold, PRESS_THRESHOLD,
    "WebXR press threshold");
  const configuredRelease = finiteThreshold(releaseThreshold, RELEASE_THRESHOLD,
    "WebXR release threshold");
  if (configuredRelease >= configuredPress) {
    throw new TypeError("WebXR release threshold must be lower than press threshold");
  }
  const buttons = Object.fromEntries(Object.entries(DEFAULT_WEBXR_CONTROL_BINDINGS.buttons)
    .map(([name, fallback]) => [name,
      bindingIndex(bindings.buttons?.[name], fallback, `WebXR ${name} button`)]));
  const keys = { ...DEFAULT_WEBXR_CONTROL_BINDINGS.keys, ...bindings.keys };
  return {
    dominantHand,
    buttons,
    keys,
    pressThreshold: configuredPress,
    releaseThreshold: configuredRelease,
  };
}

function groupCodeForAxes(axisX, axisY, threshold) {
  if (Math.hypot(axisX, axisY) < threshold) return null;
  const angle = (Math.atan2(axisX, -axisY) + Math.PI * 2) % (Math.PI * 2);
  const sector = Math.round(angle / (Math.PI * 2) * 10) % 10;
  return sector === 9 ? "Digit0" : `Digit${sector + 1}`;
}

function pulseHaptics(source, intensity) {
  const actuator = source?.gamepad?.hapticActuators?.[0];
  try {
    if (typeof actuator?.pulse === "function") {
      Promise.resolve(actuator.pulse(intensity, 24)).catch(() => {});
      return;
    }
    const vibration = source?.gamepad?.vibrationActuator;
    if (typeof vibration?.playEffect === "function") {
      Promise.resolve(vibration.playEffect("dual-rumble", {
        duration: 24,
        strongMagnitude: 0,
        weakMagnitude: intensity,
      })).catch(() => {});
    }
  } catch {
    // Haptics are optional feedback and must never interrupt engine input.
  }
}

function actionTarget(target) {
  return target ? {
    target: target.target,
    point: { ...target.point },
    ray: target.ray ? {
      origin: [...target.ray.origin],
      end: [...target.ray.end],
    } : null,
  } : { target: null, point: null, ray: null };
}

export function createWebXrControls({
  onAction = null,
  bindings = {},
  pressThreshold,
  releaseThreshold,
} = {}) {
  const config = webXrControlConfig({ bindings, pressThreshold, releaseThreshold });
  const sources = new Map();
  const anonymousSourceIds = new WeakMap();
  const modifiers = { control: false, alt: false, shift: false };
  let nextAnonymousSourceId = 1;
  let pointer = null;
  let paired = false;

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
      emit({ type: "button", button: "primary", down: false,
        ...actionTarget(sourceState.lastTarget) });
    }
    if (sourceState.secondaryDown) {
      emit({ type: "button", button: "secondary", down: false,
        ...actionTarget(sourceState.lastTarget) });
    }
    setKey(sourceState, "horizontalKey", null);
    setKey(sourceState, "verticalKey", null);
    sourceState.primaryDown = false;
    sourceState.secondaryDown = false;
  }

  function setModifier(name, code, down) {
    if (modifiers[name] === down) return;
    modifiers[name] = down;
    emit({ type: "key", code, down });
  }

  function setModifiers({ control = false, alt = false, shift = false } = {}) {
    setModifier("control", "ControlLeft", control);
    setModifier("alt", "AltLeft", alt);
    setModifier("shift", "ShiftLeft", shift);
  }

  function stroke(code) {
    emit({ type: "key", code, down: true });
    emit({ type: "key", code, down: false });
  }

  function createSourceState(source, role) {
    return {
      role,
      handedness: source?.handedness ?? "none",
      profile: source?.profiles?.[0] ?? source?.gamepad?.mapping ?? "unknown",
      horizontalKey: null,
      verticalKey: null,
      primaryDown: false,
      secondaryDown: false,
      thumbstickDown: false,
      primaryActionDown: false,
      secondaryActionDown: false,
      primaryActionUsed: false,
      secondaryActionUsed: false,
      groupChosen: false,
      recenterChordDown: false,
      lastTarget: null,
    };
  }

  function buttonDown(buttons, name) {
    return pressed(buttons[config.buttons[name]], config.pressThreshold);
  }

  function sourceKey(source) {
    const explicitId = source?.id ?? source?.index;
    if (explicitId !== undefined && explicitId !== null) {
      return `${explicitId}:${source?.handedness ?? "none"}`;
    }
    if (!source || (typeof source !== "object" && typeof source !== "function")) {
      return `unknown:${source?.handedness ?? "none"}`;
    }
    let id = anonymousSourceIds.get(source);
    if (id === undefined) {
      id = nextAnonymousSourceId;
      nextAnonymousSourceId += 1;
      anonymousSourceIds.set(source, id);
    }
    return `anonymous-${id}:${source?.handedness ?? "none"}`;
  }

  function update({
    inputSources = [],
    anchorTransform,
    panelWidthMeters,
    panelHeightMeters,
    panelDistanceMeters,
    backbufferWidth,
    backbufferHeight,
    resolveWorldRay = null,
  } = {}) {
    const seen = new Set();
    const hits = [];
    const trackedSources = Array.from(inputSources ?? []);
    const oppositeHand = config.dominantHand === "right" ? "left" : "right";
    paired = trackedSources.some((source) => source?.handedness === config.dominantHand)
      && trackedSources.some((source) => source?.handedness === oppositeHand);
    const entries = [];
    for (const source of trackedSources) {
      const key = sourceKey(source);
      seen.add(key);
      const role = paired && source?.handedness === oppositeHand ? "offhand" : "dominant";
      let sourceState = sources.get(key);
      if (!sourceState) {
        sourceState = createSourceState(source, role);
        sources.set(key, sourceState);
      } else if (sourceState.role !== role) {
        releaseSource(sourceState);
        sourceState.role = role;
        sourceState.groupChosen = false;
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
      const worldRay = source?.targetRayPose?.matrix && typeof resolveWorldRay === "function"
        ? resolveWorldRay(source.targetRayPose.matrix, source)
        : null;
      const target = hit || worldRay ? {
        target: hit ? "ui" : "world",
        point: hit?.point ?? {
          x: Math.max(0, Math.round((Number(backbufferWidth) - 1) * 0.5)),
          y: Math.max(0, Math.round((Number(backbufferHeight) - 1) * 0.5)),
        },
        ray: worldRay,
        u: hit?.u ?? null,
        v: hit?.v ?? null,
      } : null;
      if (target) {
        sourceState.lastTarget = target;
        hits.push({ source, role, target,
          trigger: buttonDown(source?.gamepad?.buttons ?? [], "trigger") });
      }

      const buttons = source?.gamepad?.buttons ?? [];
      const [axisX, axisY] = primaryAxes(source?.gamepad);
      entries.push({ source, sourceState, buttons, axisX, axisY, target });
    }

    const desiredModifiers = { control: false, alt: false, shift: false };
    for (const entry of entries) {
      const { sourceState, buttons, axisX, axisY } = entry;
      if (paired && sourceState.role === "offhand") {
        desiredModifiers.alt ||= buttonDown(buttons, "trigger");
        desiredModifiers.control ||= buttonDown(buttons, "squeeze");
        desiredModifiers.shift ||= buttonDown(buttons, "primaryAction");
      } else if (!paired) {
        const thumbstickDown = buttonDown(buttons, "thumbstick");
        const secondaryActionDown = buttonDown(buttons, "secondaryAction");
        const groupMode = thumbstickDown
          && groupCodeForAxes(axisX, axisY, config.pressThreshold) !== null;
        desiredModifiers.control ||= buttonDown(buttons, "auxiliary");
        desiredModifiers.alt ||= thumbstickDown && (!groupMode || secondaryActionDown);
        desiredModifiers.shift ||= buttonDown(buttons, "primaryAction");
      }
    }
    setModifiers(desiredModifiers);

    for (const { source, sourceState, buttons, axisX, axisY, target } of entries) {
      const trigger = buttonDown(buttons, "trigger");
      const squeeze = buttonDown(buttons, "squeeze");
      const clicksEnabled = sourceState.role === "dominant";
      const primaryDown = clicksEnabled && trigger && Boolean(target);
      const secondaryDown = clicksEnabled && squeeze && Boolean(target ?? sourceState.lastTarget);
      if (!paired && (trigger || squeeze)) {
        sourceState.primaryActionUsed ||= buttonDown(buttons, "primaryAction");
        sourceState.secondaryActionUsed ||= buttonDown(buttons, "secondaryAction");
      }

      if (primaryDown !== sourceState.primaryDown) {
        emit({ type: "button", button: "primary", down: primaryDown,
          ...actionTarget(target ?? sourceState.lastTarget) });
        if (primaryDown) pulseHaptics(source, 0.22);
        sourceState.primaryDown = primaryDown;
      }
      if (secondaryDown !== sourceState.secondaryDown) {
        emit({ type: "button", button: "secondary", down: secondaryDown,
          ...actionTarget(target ?? sourceState.lastTarget) });
        if (secondaryDown) pulseHaptics(source, 0.32);
        sourceState.secondaryDown = secondaryDown;
      }

      const thumbstickDown = buttonDown(buttons, "thumbstick");
      const primaryActionDown = buttonDown(buttons, "primaryAction");
      const secondaryActionDown = buttonDown(buttons, "secondaryAction");
      const groupCode = thumbstickDown
        ? groupCodeForAxes(axisX, axisY, config.pressThreshold) : null;

      if (paired && sourceState.role === "dominant") {
        if (primaryActionDown && !sourceState.primaryActionDown) stroke(config.keys.attackMove);
        if (secondaryActionDown && !sourceState.secondaryActionDown) stroke(config.keys.cancel);
        if (thumbstickDown && !sourceState.thumbstickDown) emit({ type: "recenter" });
        setKey(sourceState, "horizontalKey",
          desiredAxisState(axisX, config.keys.rotateLeft, config.keys.rotateRight,
            sourceState.horizontalKey, config.pressThreshold, config.releaseThreshold));
        setKey(sourceState, "verticalKey",
          desiredAxisState(axisY, config.keys.zoomIn, config.keys.zoomOut,
            sourceState.verticalKey, config.pressThreshold, config.releaseThreshold));
      } else if (paired) {
        if (groupCode && !sourceState.groupChosen) {
          stroke(groupCode);
          pulseHaptics(source, 0.16);
          sourceState.groupChosen = true;
        }
        if (!thumbstickDown) sourceState.groupChosen = false;
        setKey(sourceState, "horizontalKey", groupCode ? null
          : desiredAxisState(axisX, config.keys.panLeft, config.keys.panRight,
            sourceState.horizontalKey, config.pressThreshold, config.releaseThreshold));
        setKey(sourceState, "verticalKey", groupCode ? null
          : desiredAxisState(axisY, config.keys.panUp, config.keys.panDown,
            sourceState.verticalKey, config.pressThreshold, config.releaseThreshold));
        if (secondaryActionDown && !sourceState.secondaryActionDown) emit({ type: "recenter" });
      } else {
        if (primaryActionDown && !sourceState.primaryActionDown) {
          sourceState.primaryActionUsed = false;
        }
        if (secondaryActionDown && !sourceState.secondaryActionDown) {
          sourceState.secondaryActionUsed = false;
        }
        const recenterChordDown = primaryActionDown && secondaryActionDown;
        if (recenterChordDown && !sourceState.recenterChordDown) {
          emit({ type: "recenter" });
          sourceState.primaryActionUsed = true;
          sourceState.secondaryActionUsed = true;
        }
        if (groupCode && !sourceState.groupChosen) {
          stroke(groupCode);
          pulseHaptics(source, 0.16);
          sourceState.groupChosen = true;
          sourceState.primaryActionUsed ||= primaryActionDown;
          sourceState.secondaryActionUsed ||= secondaryActionDown;
        }
        if (!thumbstickDown) sourceState.groupChosen = false;
        const cameraMode = secondaryActionDown && !thumbstickDown;
        if (cameraMode && (Math.abs(axisX) >= config.pressThreshold
            || Math.abs(axisY) >= config.pressThreshold)) {
          sourceState.secondaryActionUsed = true;
        }
        setKey(sourceState, "horizontalKey",
          groupCode ? null : desiredAxisState(axisX,
            cameraMode ? config.keys.rotateLeft : config.keys.panLeft,
            cameraMode ? config.keys.rotateRight : config.keys.panRight,
            sourceState.horizontalKey, config.pressThreshold, config.releaseThreshold));
        setKey(sourceState, "verticalKey",
          groupCode ? null : desiredAxisState(axisY,
            cameraMode ? config.keys.zoomIn : config.keys.panUp,
            cameraMode ? config.keys.zoomOut : config.keys.panDown,
            sourceState.verticalKey, config.pressThreshold, config.releaseThreshold));
        if (!primaryActionDown && sourceState.primaryActionDown
            && !sourceState.primaryActionUsed) {
          stroke(config.keys.attackMove);
        }
        if (!secondaryActionDown && sourceState.secondaryActionDown
            && !sourceState.secondaryActionUsed) {
          stroke(config.keys.cancel);
        }
        sourceState.recenterChordDown = recenterChordDown;
      }

      sourceState.thumbstickDown = thumbstickDown;
      sourceState.primaryActionDown = primaryActionDown;
      sourceState.secondaryActionDown = secondaryActionDown;
    }

    for (const [key, sourceState] of sources) {
      if (seen.has(key)) continue;
      releaseSource(sourceState);
      sources.delete(key);
    }
    if (sources.size === 0) setModifiers();

    hits.sort((left, right) => Number(right.role === "dominant") - Number(left.role === "dominant")
      || Number(right.trigger) - Number(left.trigger)
      || Number(right.target.target === "ui") - Number(left.target.target === "ui")
      || Number(right.source?.handedness === config.dominantHand)
        - Number(left.source?.handedness === config.dominantHand));
    const activeHit = hits[0] ?? null;
    const hadPointer = pointer !== null;
    pointer = activeHit ? {
      handedness: activeHit.source?.handedness ?? "none",
      ...actionTarget(activeHit.target),
      u: activeHit.target.u,
      v: activeHit.target.v,
    } : null;
    if (pointer) emit({ type: "pointer", ...actionTarget(pointer),
      handedness: pointer.handedness });
    else if (hadPointer) emit({ type: "pickRay", ray: null });
    return snapshot();
  }

  function reset() {
    for (const sourceState of sources.values()) releaseSource(sourceState);
    sources.clear();
    setModifiers();
    paired = false;
    pointer = null;
  }

  function snapshot() {
    return {
      sourceCount: sources.size,
      paired,
      dominantHand: config.dominantHand,
      sources: Array.from(sources.values(), (sourceState) => ({
        handedness: sourceState.handedness,
        profile: sourceState.profile,
        role: sourceState.role,
      })),
      pointer: pointer ? {
        ...pointer,
        ...actionTarget(pointer),
      } : null,
    };
  }

  return { update, reset, snapshot };
}
