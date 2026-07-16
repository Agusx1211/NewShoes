const DEFAULTS = Object.freeze({
  dragThresholdPx: 8,
  panThresholdPx: 8,
  rotationThresholdRadians: Math.PI / 18,
  rotationPanLimitPx: 14,
  rotationPinchLimitRatio: 0.1,
  pinchStepRatio: 0.06,
  longPressMs: 600,
});

function copyPoint(point) {
  return { x: Number(point?.x ?? 0), y: Number(point?.y ?? 0) };
}

function pointerPoint(event) {
  return { x: Number(event.clientX ?? 0), y: Number(event.clientY ?? 0) };
}

function distance(left, right) {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function centroid(left, right) {
  return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
}

function angle(left, right) {
  return Math.atan2(right.y - left.y, right.x - left.x);
}

function normalizedAngleDelta(value) {
  let result = value;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
}

/**
 * Recognizes RTS touch gestures without knowing anything about the DOM or the
 * engine transport. The emitted actions are consumed by the browser input
 * bridge and deliberately mirror real mouse buttons/wheel events.
 */
export class TouchGestureRecognizer {
  constructor({
    emit = () => {},
    setTimer = (callback, delay) => setTimeout(callback, delay),
    clearTimer = (timer) => clearTimeout(timer),
    thresholds = {},
  } = {}) {
    this.emit = emit;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.thresholds = { ...DEFAULTS, ...thresholds };
    this.pointers = new Map();
    this.phase = "idle";
    this.primaryId = null;
    this.primaryButtonDown = false;
    this.multi = null;
    this.longPressTimer = null;
    this.secondaryArmed = false;
  }

  armSecondary(armed = true) {
    this.secondaryArmed = Boolean(armed);
    return this.secondaryArmed;
  }

  clearLongPress() {
    if (this.longPressTimer !== null) {
      this.clearTimer(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  emitMove(point, timestamp = 0) {
    this.emit({ type: "move", point: copyPoint(point), timestamp });
  }

  emitButton(button, down, point, timestamp = 0) {
    this.emit({ type: "button", button, down, point: copyPoint(point), timestamp });
  }

  emitClick(button, point, timestamp = 0) {
    this.emitMove(point, timestamp);
    this.emitButton(button, true, point, timestamp);
    this.emitButton(button, false, point, timestamp + 1);
    this.emit({ type: "tap", button, point: copyPoint(point), timestamp });
  }

  armLongPress() {
    this.clearLongPress();
    this.longPressTimer = this.setTimer(() => {
      this.longPressTimer = null;
      if (this.phase !== "pending" || this.pointers.size !== 1) return;
      const pointer = this.pointers.get(this.primaryId);
      if (!pointer || distance(pointer.start, pointer.current) >= this.thresholds.dragThresholdPx) return;
      this.emitClick(2, pointer.start, pointer.timestamp);
      this.emit({ type: "haptic", pattern: 20 });
      this.secondaryArmed = false;
      this.phase = "long-press";
    }, this.thresholds.longPressMs);
  }

  startMultiGesture(timestamp = 0) {
    const tracked = [...this.pointers.values()].slice(0, 2);
    if (tracked.length !== 2) return;
    const center = centroid(tracked[0].current, tracked[1].current);
    const spread = Math.max(1, distance(tracked[0].current, tracked[1].current));
    this.multi = {
      startCenter: center,
      currentCenter: center,
      startDistance: spread,
      wheelDistance: spread,
      startAngle: angle(tracked[0].current, tracked[1].current),
      panDown: false,
      rotateDown: false,
      manipulated: false,
    };
    this.phase = "multi";
    this.emitMove(center, timestamp);
  }

  pointerDown(event) {
    const id = Number(event.pointerId);
    const point = pointerPoint(event);
    const timestamp = Number(event.timeStamp ?? 0);
    if (this.pointers.has(id)) return;
    this.pointers.set(id, { start: point, current: point, timestamp });

    if (this.pointers.size === 1) {
      this.primaryId = id;
      this.phase = "pending";
      this.emitMove(point, timestamp);
      this.armLongPress();
      return;
    }

    if (this.pointers.size === 2 && (this.phase === "pending" || this.phase === "drag")) {
      this.clearLongPress();
      if (this.primaryButtonDown) {
        const primary = this.pointers.get(this.primaryId);
        this.emitButton(0, false, primary?.current ?? point, timestamp);
        this.primaryButtonDown = false;
      }
      this.startMultiGesture(timestamp);
    }
  }

  updateMulti(timestamp = 0) {
    const tracked = [...this.pointers.values()].slice(0, 2);
    if (!this.multi || tracked.length !== 2) return;
    const center = centroid(tracked[0].current, tracked[1].current);
    const spread = Math.max(1, distance(tracked[0].current, tracked[1].current));
    const translation = distance(this.multi.startCenter, center);
    const rotation = normalizedAngleDelta(
      angle(tracked[0].current, tracked[1].current) - this.multi.startAngle,
    );
    const pinchFromStart = Math.abs(Math.log(spread / this.multi.startDistance));
    this.multi.currentCenter = center;

    if (!this.multi.panDown && !this.multi.rotateDown
        && Math.abs(rotation) >= this.thresholds.rotationThresholdRadians
        && translation < this.thresholds.rotationPanLimitPx
        && pinchFromStart < this.thresholds.rotationPinchLimitRatio) {
      this.multi.rotateDown = true;
      this.multi.manipulated = true;
      this.phase = "multi-rotate";
      this.emit({
        type: "rotate-start",
        point: copyPoint(this.multi.startCenter),
        timestamp,
      });
    }

    if (this.multi.rotateDown) {
      this.emit({
        type: "rotate-move",
        point: copyPoint(center),
        radians: rotation,
        timestamp,
      });
      return;
    }

    if (!this.multi.panDown && this.phase !== "multi-pinch"
        && translation >= this.thresholds.panThresholdPx) {
      this.multi.panDown = true;
      this.multi.manipulated = true;
      this.phase = "multi-pan";
      this.emitMove(this.multi.startCenter, timestamp);
      this.emitButton(2, true, this.multi.startCenter, timestamp);
    }
    if (this.multi.panDown) {
      this.emitMove(center, timestamp);
      return;
    }

    let ratio = spread / this.multi.wheelDistance;
    while (ratio >= 1 + this.thresholds.pinchStepRatio) {
      this.phase = "multi-pinch";
      this.emit({ type: "wheel", steps: 1, point: copyPoint(center), timestamp });
      this.multi.wheelDistance *= 1 + this.thresholds.pinchStepRatio;
      this.multi.manipulated = true;
      ratio = spread / this.multi.wheelDistance;
    }
    while (ratio <= 1 - this.thresholds.pinchStepRatio) {
      this.phase = "multi-pinch";
      this.emit({ type: "wheel", steps: -1, point: copyPoint(center), timestamp });
      this.multi.wheelDistance *= 1 - this.thresholds.pinchStepRatio;
      this.multi.manipulated = true;
      ratio = spread / this.multi.wheelDistance;
    }
  }

  pointerMove(event) {
    const id = Number(event.pointerId);
    const pointer = this.pointers.get(id);
    if (!pointer) return;
    pointer.current = pointerPoint(event);
    const timestamp = Number(event.timeStamp ?? 0);

    if (this.phase === "pending" && id === this.primaryId) {
      if (distance(pointer.start, pointer.current) >= this.thresholds.dragThresholdPx) {
        this.clearLongPress();
        this.phase = "drag";
        this.emitMove(pointer.start, timestamp);
        this.emitButton(0, true, pointer.start, timestamp);
        this.primaryButtonDown = true;
        this.emitMove(pointer.current, timestamp);
      }
      return;
    }
    if (this.phase === "drag" && id === this.primaryId) {
      this.emitMove(pointer.current, timestamp);
      return;
    }
    if (this.phase.startsWith("multi")) {
      this.updateMulti(timestamp);
    }
  }

  finishMulti(timestamp, cancelled) {
    if (!this.multi) return;
    if (this.multi.panDown) {
      this.emitButton(2, false, this.multi.currentCenter, timestamp);
    }
    if (this.multi.rotateDown) {
      this.emit({
        type: "rotate-end",
        point: copyPoint(this.multi.currentCenter),
        timestamp,
      });
    }
    if (!cancelled && !this.multi.manipulated) {
      this.emitClick(2, this.multi.currentCenter, timestamp);
    }
    this.multi = null;
    this.phase = "swallow";
  }

  pointerUp(event, { cancelled = false } = {}) {
    const id = Number(event.pointerId);
    const pointer = this.pointers.get(id);
    if (!pointer) return;
    pointer.current = pointerPoint(event);
    const timestamp = Number(event.timeStamp ?? 0);
    this.clearLongPress();

    if (this.phase.startsWith("multi")) {
      this.updateMulti(timestamp);
      this.finishMulti(timestamp, cancelled);
    } else if (this.phase === "pending" && id === this.primaryId) {
      if (!cancelled) {
        const button = this.secondaryArmed ? 2 : 0;
        this.emitClick(button, pointer.start, timestamp);
        this.secondaryArmed = false;
      }
      this.phase = "swallow";
    } else if (this.phase === "drag" && id === this.primaryId) {
      if (this.primaryButtonDown) {
        this.emitMove(pointer.current, timestamp);
        this.emitButton(0, false, pointer.current, timestamp);
        this.primaryButtonDown = false;
      }
      this.phase = "swallow";
    }

    this.pointers.delete(id);
    if (this.pointers.size === 0) this.resetState();
  }

  pointerCancel(event) {
    this.pointerUp(event, { cancelled: true });
  }

  resetState() {
    this.clearLongPress();
    this.pointers.clear();
    this.phase = "idle";
    this.primaryId = null;
    this.primaryButtonDown = false;
    this.multi = null;
  }

  cancelAll(timestamp = 0) {
    this.clearLongPress();
    if (this.primaryButtonDown) {
      const pointer = this.pointers.get(this.primaryId);
      this.emitButton(0, false, pointer?.current ?? { x: 0, y: 0 }, timestamp);
    }
    if (this.multi?.panDown) {
      this.emitButton(2, false, this.multi.currentCenter, timestamp);
    }
    if (this.multi?.rotateDown) {
      this.emit({ type: "rotate-end", point: copyPoint(this.multi.currentCenter), timestamp });
    }
    this.resetState();
  }

  snapshot() {
    return {
      phase: this.phase,
      pointerCount: this.pointers.size,
      secondaryArmed: this.secondaryArmed,
      primaryButtonDown: this.primaryButtonDown,
      panDown: this.multi?.panDown === true,
      rotateDown: this.multi?.rotateDown === true,
    };
  }
}

function touchCapabilityAvailable() {
  return Number(globalThis.navigator?.maxTouchPoints ?? 0) > 0
    || globalThis.matchMedia?.("(pointer: coarse)")?.matches === true;
}

function safeStorageGet(key) {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeStorageSet(key, value) {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Touch help remains session-local when storage is unavailable.
  }
}

export function createTouchControls({
  canvas,
  root,
  textInput,
  textBar,
  onMove = () => {},
  onButton = () => {},
  onWheel = () => {},
  onRotateStart = () => {},
  onRotateMove = () => {},
  onRotateEnd = () => {},
  onKeyStroke = () => {},
  onText = () => {},
  onComposition = () => {},
  onTap = () => {},
  textInputModeAtPoint = () => null,
  focusedTextInputMode = () => null,
  onViewportKeyboardChange = () => {},
  forceEnabled = false,
} = {}) {
  if (!canvas || !root) {
    return {
      enabled: false,
      handles: () => false,
      snapshot: () => ({ enabled: false }),
      cancel: () => {},
    };
  }

  const enabled = forceEnabled || touchCapabilityAvailable();
  root.hidden = !enabled;
  const keyPanel = root.querySelector("[data-touch-key-panel]");
  const guide = root.querySelector("[data-touch-guide]");
  const orderButton = root.querySelector("[data-touch-action='order']");
  const keysButton = root.querySelector("[data-touch-action='keys']");
  const helpButton = root.querySelector("[data-touch-action='help']");
  const modifiers = new Set();
  let lastPoint = { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 };
  let rotateAnchor = null;
  let textKeyboardOpen = false;
  let frozenViewportHeight = 0;
  let keyboardCleanupTimer = null;
  let handledBeforeInput = false;
  let composing = false;

  const recognizer = new TouchGestureRecognizer({
    emit(action) {
      if (action.point) lastPoint = copyPoint(action.point);
      if (action.type === "move") onMove(action.point, action.timestamp);
      else if (action.type === "button") {
        onButton(action.button, action.down, action.point, action.timestamp);
      } else if (action.type === "wheel") {
        onWheel(action.steps, action.point, action.timestamp);
      } else if (action.type === "rotate-start") {
        rotateAnchor = copyPoint(action.point);
        onRotateStart(action.point, action.timestamp);
      } else if (action.type === "rotate-move") {
        onRotateMove(action.radians, rotateAnchor ?? action.point, action.timestamp);
      } else if (action.type === "rotate-end") {
        onRotateEnd(action.point, action.timestamp);
        rotateAnchor = null;
      } else if (action.type === "haptic") {
        globalThis.navigator?.vibrate?.(action.pattern);
      } else if (action.type === "tap") {
        onTap(action.point, action.button);
        const inputMode = action.button === 0 ? textInputModeAtPoint(action.point) : null;
        if (inputMode) openTextKeyboard(inputMode);
      }
      syncOrderButton();
    },
  });

  function syncOrderButton() {
    if (!orderButton) return;
    orderButton.setAttribute("aria-pressed", recognizer.secondaryArmed ? "true" : "false");
    orderButton.classList.toggle("is-armed", recognizer.secondaryArmed);
  }

  function setKeyboardViewportState(open) {
    textKeyboardOpen = open;
    const html = document.documentElement;
    if (open) {
      if (keyboardCleanupTimer !== null) {
        clearTimeout(keyboardCleanupTimer);
        keyboardCleanupTimer = null;
      }
      frozenViewportHeight = Math.max(
        1,
        Math.round(document.querySelector("#launchOverlay")?.getBoundingClientRect().height
          || document.documentElement.getBoundingClientRect().height
          || window.innerHeight),
      );
      html.style.setProperty("--touch-frozen-viewport-height", `${frozenViewportHeight}px`);
      html.classList.add("touch-keyboard-open");
      updateKeyboardInset();
      requestAnimationFrame(updateKeyboardInset);
    } else {
      html.classList.remove("touch-keyboard-open");
      if (keyboardCleanupTimer !== null) clearTimeout(keyboardCleanupTimer);
      keyboardCleanupTimer = setTimeout(() => {
        html.style.removeProperty("--touch-frozen-viewport-height");
        html.style.removeProperty("--touch-keyboard-inset");
        frozenViewportHeight = 0;
        keyboardCleanupTimer = null;
      }, 400);
    }
    onViewportKeyboardChange(open);
    window.dispatchEvent(new CustomEvent("cncport:virtualkeyboardchange", {
      detail: { open, source: "touch-controls" },
    }));
  }

  function updateKeyboardInset() {
    if (!textKeyboardOpen || frozenViewportHeight <= 0) return;
    const viewport = window.visualViewport;
    const visibleBottom = viewport
      ? Number(viewport.offsetTop ?? 0) + Number(viewport.height ?? frozenViewportHeight)
      : Number(window.innerHeight ?? frozenViewportHeight);
    const inset = Math.max(0, Math.round(frozenViewportHeight - visibleBottom));
    document.documentElement.style.setProperty("--touch-keyboard-inset", `${inset}px`);
  }

  function openTextKeyboard(inputMode = "text") {
    if (!textInput || !textBar) return false;
    textBar.hidden = false;
    textInput.setAttribute("inputmode", inputMode === "numeric" ? "numeric" : "text");
    setKeyboardViewportState(true);
    try {
      textInput.focus({ preventScroll: true });
    } catch {
      textInput.focus();
    }
    try {
      globalThis.navigator?.virtualKeyboard?.show?.();
    } catch {
      // Focusing the native input is the portable keyboard request.
    }
    return document.activeElement === textInput;
  }

  function closeTextKeyboard() {
    if (!textInput || !textBar) return;
    try {
      globalThis.navigator?.virtualKeyboard?.hide?.();
    } catch {
      // blur() below is the portable close path.
    }
    textInput.blur();
    textBar.hidden = true;
    textInput.value = "";
    setKeyboardViewportState(false);
    try {
      canvas.focus({ preventScroll: true });
    } catch {
      canvas.focus();
    }
  }

  if (enabled && globalThis.navigator?.virtualKeyboard) {
    try {
      globalThis.navigator.virtualKeyboard.overlaysContent = true;
    } catch {
      // Safari currently has no VirtualKeyboard API; viewport freezing below
      // is the fallback for browsers that resize while the keyboard is open.
    }
  }
  window.visualViewport?.addEventListener("resize", updateKeyboardInset);
  window.visualViewport?.addEventListener("scroll", updateKeyboardInset);
  window.addEventListener("resize", updateKeyboardInset);

  function handles(event) {
    return enabled && event?.pointerType === "touch";
  }

  function claim(event) {
    try {
      canvas.setPointerCapture?.(event.pointerId);
    } catch {
      // Pointer cancellation still releases any synthesized engine button.
    }
  }

  function release(event) {
    try {
      if (canvas.hasPointerCapture?.(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    } catch {
      // A browser may already have released capture during cancellation.
    }
  }

  function handlePointerDown(event) {
    if (!handles(event)) return false;
    event.preventDefault();
    if (textKeyboardOpen) closeTextKeyboard();
    claim(event);
    recognizer.pointerDown(event);
    return true;
  }

  function handlePointerMove(event) {
    if (!handles(event)) return false;
    event.preventDefault();
    recognizer.pointerMove(event);
    return true;
  }

  function handlePointerUp(event) {
    if (!handles(event)) return false;
    event.preventDefault();
    recognizer.pointerUp(event);
    release(event);
    return true;
  }

  function handlePointerCancel(event) {
    if (!handles(event)) return false;
    event.preventDefault();
    recognizer.pointerCancel(event);
    release(event);
    return true;
  }

  function handleLostPointerCapture(event) {
    if (!handles(event) || !recognizer.pointers.has(Number(event.pointerId))) return false;
    recognizer.pointerCancel(event);
    return true;
  }

  root.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });

  root.querySelector("[data-touch-action='order']")?.addEventListener("click", () => {
    recognizer.armSecondary(!recognizer.secondaryArmed);
    syncOrderButton();
  });
  root.querySelector("[data-touch-action='escape']")?.addEventListener("click", () => {
    onKeyStroke({ code: "Escape", key: "Escape", modifiers: [] });
  });
  root.querySelector("[data-touch-action='type']")?.addEventListener("click", () => {
    openTextKeyboard(focusedTextInputMode() ?? "text");
  });
  for (const button of root.querySelectorAll("[data-touch-action='keys']")) {
    button.addEventListener("click", () => {
      const open = keyPanel?.hidden !== false;
      if (keyPanel) keyPanel.hidden = !open;
      keysButton?.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }
  root.querySelector("[data-touch-action='help']")?.addEventListener("click", () => {
    const open = guide?.hidden !== false;
    if (guide) guide.hidden = !open;
    helpButton?.setAttribute("aria-expanded", open ? "true" : "false");
  });
  root.querySelector("[data-touch-action='dismiss-help']")?.addEventListener("click", () => {
    if (guide) guide.hidden = true;
    helpButton?.setAttribute("aria-expanded", "false");
    safeStorageSet("cnc-touch-guide-dismissed", "1");
  });
  if (guide && safeStorageGet("cnc-touch-guide-dismissed") !== "1") {
    guide.hidden = false;
    helpButton?.setAttribute("aria-expanded", "true");
  }

  for (const button of root.querySelectorAll("[data-touch-modifier]")) {
    button.addEventListener("click", () => {
      const code = String(button.dataset.touchModifier);
      if (modifiers.has(code)) modifiers.delete(code);
      else modifiers.add(code);
      button.setAttribute("aria-pressed", modifiers.has(code) ? "true" : "false");
    });
  }

  function clearModifiers() {
    modifiers.clear();
    for (const button of root.querySelectorAll("[data-touch-modifier]")) {
      button.setAttribute("aria-pressed", "false");
    }
  }

  for (const button of root.querySelectorAll("[data-touch-key]")) {
    button.addEventListener("click", () => {
      onKeyStroke({
        code: String(button.dataset.touchKey),
        key: String(button.dataset.touchKeyValue ?? button.textContent ?? ""),
        modifiers: [...modifiers],
      });
      clearModifiers();
    });
  }

  for (const button of root.querySelectorAll("[data-touch-camera]")) {
    button.addEventListener("click", () => {
      const action = button.dataset.touchCamera;
      if (action === "zoom-in") onWheel(1, lastPoint, performance.now());
      else if (action === "zoom-out") onWheel(-1, lastPoint, performance.now());
      else if (action === "reset") {
        onButton(1, true, lastPoint, performance.now());
        onButton(1, false, lastPoint, performance.now() + 1);
      } else if (action === "rotate-left" || action === "rotate-right") {
        const direction = action === "rotate-left" ? -1 : 1;
        onRotateStart(lastPoint, performance.now());
        onRotateMove(direction * Math.PI / 12, lastPoint, performance.now());
        onRotateEnd(lastPoint, performance.now() + 1);
      }
    });
  }

  root.querySelector("[data-touch-text-done]")?.addEventListener("click", closeTextKeyboard);

  if (textInput) {
    textInput.addEventListener("compositionstart", (event) => {
      composing = true;
      onComposition("start", event.data ?? "");
    });
    textInput.addEventListener("compositionupdate", (event) => {
      onComposition("update", event.data ?? "");
    });
    textInput.addEventListener("compositionend", (event) => {
      composing = false;
      onComposition("end", event.data ?? "");
      textInput.value = "";
    });
    textInput.addEventListener("beforeinput", (event) => {
      if (composing || event.isComposing) return;
      handledBeforeInput = false;
      if (event.inputType === "deleteContentBackward") {
        event.preventDefault();
        onKeyStroke({ code: "Backspace", key: "Backspace", modifiers: [] });
        handledBeforeInput = true;
      } else if (event.inputType === "insertLineBreak" || event.inputType === "insertParagraph") {
        event.preventDefault();
        onKeyStroke({ code: "Enter", key: "Enter", modifiers: [] });
        handledBeforeInput = true;
      } else if (typeof event.data === "string" && event.data.length > 0) {
        event.preventDefault();
        onText(event.data);
        handledBeforeInput = true;
      }
    });
    textInput.addEventListener("input", () => {
      if (!composing && !handledBeforeInput && textInput.value.length > 0) {
        onText(textInput.value);
      }
      if (!composing) textInput.value = "";
      handledBeforeInput = false;
    });
    textInput.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeTextKeyboard();
      } else if (["Tab", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Delete"].includes(event.key)) {
        event.preventDefault();
        onKeyStroke({ code: event.code || event.key, key: event.key, modifiers: [] });
      }
    });
  }

  syncOrderButton();
  return {
    enabled,
    handles,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleLostPointerCapture,
    armSecondary: (armed) => {
      const value = recognizer.armSecondary(armed);
      syncOrderButton();
      return value;
    },
    openTextKeyboard,
    closeTextKeyboard,
    cancel: (timestamp = performance.now()) => recognizer.cancelAll(timestamp),
    snapshot: () => ({
      enabled,
      keyboardOpen: textKeyboardOpen,
      keyPanelOpen: keyPanel?.hidden === false,
      guideOpen: guide?.hidden === false,
      ...recognizer.snapshot(),
    }),
  };
}
