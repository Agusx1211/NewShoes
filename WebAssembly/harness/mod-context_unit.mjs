import assert from "node:assert/strict";
import {
  CNC_PORT_USER_DATA_HOME,
  MOD_ACTIVE_CONTEXT_KEY,
  MOD_LIBRARY_KEY,
  activeModMountPlan,
  createModContext,
  deriveMultiplayerRoom,
  loadActiveModContext,
  loadModContextHistory,
  modContextPaths,
  saveActiveModContext,
  saveModLibrary,
  vanillaModContext,
} from "./mod-context.mjs";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    value: (key) => values.get(key),
  };
}

function fakeMod(id, name, contentHash, archiveHash) {
  return {
    id,
    name,
    version: "1.0",
    contentHash,
    archives: [{
      opfsPath: `cnc-mods/${id}/archives/content.big`,
      size: 1234,
      sha256: archiveHash,
    }],
  };
}

const hashA = "a".repeat(64);
const hashB = "b".repeat(64);
const modA = fakeMod("mod-aaaaaaaa", "Alpha", hashA, "1".repeat(64));
const modB = fakeMod("mod-bbbbbbbb", "Beta", hashB, "2".repeat(64));
const vanilla = vanillaModContext();
assert.equal(modContextPaths(vanilla).home, CNC_PORT_USER_DATA_HOME);
assert.equal(deriveMultiplayerRoom("lobby", vanilla), "pns-v1:vanilla:lobby");
assert.equal(deriveMultiplayerRoom("", vanilla), "");

const storage = memoryStorage();
saveModLibrary(storage, { schema: 1, mods: [modA, modB] });
assert.ok(storage.value(MOD_LIBRARY_KEY));

const alphaBeta = await createModContext([modA, modB]);
const alphaBetaAgain = await createModContext([modA, modB]);
const betaAlpha = await createModContext([modB, modA]);
const modAArchiveDisabled = { ...modA, archives: [{ ...modA.archives[0], enabled: false }] };
assert.equal(alphaBeta.id, alphaBetaAgain.id, "an identical ordered composition must be stable");
assert.notEqual(alphaBeta.id, betaAlpha.id, "load order must be part of the identity");
assert.notEqual(deriveMultiplayerRoom("lobby", alphaBeta), deriveMultiplayerRoom("lobby", betaAlpha));
await assert.rejects(() => createModContext([modAArchiveDisabled]), /at least one archive/);
const modAWithOption = {
  ...modA,
  archives: [
    ...modA.archives,
    { opfsPath: `cnc-mods/${modA.id}/archives/option.big`, size: 99, sha256: "3".repeat(64), enabled: false },
  ],
};
const optionOff = await createModContext([modAWithOption]);
const optionOn = await createModContext([{ ...modAWithOption, archives: modAWithOption.archives.map((archive) => ({ ...archive, enabled: true })) }]);
assert.notEqual(optionOff.id, optionOn.id, "launcher archive options must be part of the exact identity");
assert.equal(activeModMountPlan(optionOff).length, 1);
assert.equal(activeModMountPlan(optionOn).length, 2);
assert.match(modContextPaths(alphaBeta).saveDir, new RegExp(`${alphaBeta.id}/Home/.+/Save$`));
assert.match(modContextPaths(alphaBeta).replayDir, /\/Replays$/);
assert.deepEqual(activeModMountPlan(alphaBeta).map((entry) => entry.modName), ["Alpha", "Beta"]);

saveActiveModContext(storage, alphaBeta);
assert.ok(storage.value(MOD_ACTIVE_CONTEXT_KEY));
assert.equal(loadActiveModContext(storage).id, alphaBeta.id);
assert.deepEqual(loadModContextHistory(storage).map((context) => context.id), ["vanilla", alphaBeta.id]);

storage.setItem(MOD_ACTIVE_CONTEXT_KEY, JSON.stringify({ ...alphaBeta, id: "f".repeat(64) }));
assert.equal(loadActiveModContext(storage).id, "vanilla",
  "stored identities must match the exact ordered content composition");
saveActiveModContext(storage, alphaBeta);

saveModLibrary(storage, { schema: 1, mods: [modA] });
assert.equal(loadActiveModContext(storage).id, "vanilla",
  "a composition cannot launch after one of its packages was removed");

storage.setItem(MOD_ACTIVE_CONTEXT_KEY, "not-json");
assert.equal(loadActiveModContext(storage).id, "vanilla");

console.log("mod context unit passed", {
  composition: alphaBeta.id,
  reverseComposition: betaAlpha.id,
});
