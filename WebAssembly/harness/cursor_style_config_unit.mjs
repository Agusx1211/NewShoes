import assert from "node:assert/strict";
import {
  CURSOR_STYLE_SETTINGS_KEY,
  loadCursorStyle,
  normalizeCursorStyle,
  saveCursorStyle,
} from "./cursor-style-config.mjs";

class MemoryStorage {
  constructor(value = null) { this.value = value; }
  getItem(key) { return key === CURSOR_STYLE_SETTINGS_KEY ? this.value : null; }
  setItem(key, value) {
    assert.equal(key, CURSOR_STYLE_SETTINGS_KEY);
    this.value = value;
  }
}

assert.equal(normalizeCursorStyle(undefined), "game");
assert.equal(normalizeCursorStyle("game"), "game");
assert.equal(normalizeCursorStyle("system"), "system");
assert.equal(normalizeCursorStyle("unsupported"), "game");
assert.equal(loadCursorStyle(new MemoryStorage()), "game");
assert.equal(loadCursorStyle(new MemoryStorage("system")), "system");
const storage = new MemoryStorage();
assert.equal(saveCursorStyle(storage, "system"), "system");
assert.equal(storage.value, "system");
assert.equal(saveCursorStyle(storage, "bad"), "game");
assert.equal(storage.value, "game");
assert.equal(loadCursorStyle({ getItem() { throw new Error("blocked"); } }), "game");
assert.equal(saveCursorStyle({ setItem() { throw new Error("blocked"); } }, "system"), "system");

console.log("cursor style config unit: ok");
