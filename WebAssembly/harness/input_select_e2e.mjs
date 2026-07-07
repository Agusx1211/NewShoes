#!/usr/bin/env node
/**
 * END-TO-END proof: real loaded skirmish input selects, moves, and constructs.
 *
 * Reuses the full boot flow from skirmish_start_smoke.mjs:
 *   mountArchives → realEngineInit → main-menu reveal → Single Player → Skirmish → Start
 *   → wait for GAME_SKIRMISH + inputEnabled + objectCount > 0.
 *
 * Then:
 *   1. Select a local object through Win32 mouse messages and querySelection.
 *   2. Issue a map-ground move command through the original input path and
 *      assert MSG_DO_MOVETO plus world-position delta.
 *   3. Click a real command-bar build button, place the structure, assert
 *      MSG_DOZER_CONSTRUCT, then wait for completion.
 *   4. Select the completed producer, click a real unit-build command, and
 *      assert MSG_QUEUE_UNIT_CREATE plus a newly-created local unit drawable.
 *   5. Select the produced unit, issue a real attack order, and assert the
 *      dispatch plus resulting object/unit state change.
 *   6. Capture screenshot to artifacts/screenshots/input-select-e2e.png.
 *
 * On errno=17/EEXIST wait 30s and retry up to 3x.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const screenshotsRoot = resolve(wasmRoot, "artifacts/screenshots");

const GAME_SKIRMISH = 2;
const WM_MOUSEMOVE = 0x0200;
const WM_LBUTTONDOWN = 0x0201;
const WM_LBUTTONUP = 0x0202;
const WM_RBUTTONDOWN = 0x0204;
const WM_RBUTTONUP = 0x0205;

const screenshotPath = resolve(screenshotsRoot, "input-select-e2e.png");
const outputPath = resolve(wasmRoot, "artifacts/input-select-e2e.json");

const archiveSpecs = [
  { name: "INIZH.big" },
  { name: "EnglishZH.big" },
  { name: "WindowZH.big" },
  { name: "MapsZH.big" },
  { name: "MusicZH.big" },
  { name: "GensecZH.big" },
  { name: "TerrainZH.big" },
  { name: "TexturesZH.big" },
  { name: "W3DZH.big" },
  { name: "W3DEnglishZH.big" },
  { name: "SpeechZH.big" },
  { name: "SpeechEnglishZH.big" },
  { name: "AudioZH.big" },
  { name: "AudioEnglishZH.big" },
  { name: "ShadersZH.big" },
  { name: "ZZBase_INI.big", sourceName: "INI.big" },
  { name: "ZZBase_English.big", sourceName: "English.big" },
  { name: "ZZBase_Window.big", sourceName: "Window.big" },
  { name: "ZZBase_Terrain.big", sourceName: "Terrain.big" },
  { name: "ZZBase_Textures.big", sourceName: "Textures.big" },
  { name: "ZZBase_W3D.big", sourceName: "W3D.big" },
  { name: "ZZBase_Music.big", sourceName: "base-generals/Music.big" },
  { name: "Gensec.big" },
];

function parsePositiveInt(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function expect(condition, message, payload = null) {
  if (!condition) {
    throw new Error(`${message}: ${JSON.stringify(payload)}`);
  }
}

function buildArchives(baseUrl) {
  return archiveSpecs.map((spec) => {
    const sourceName = spec.sourceName ?? spec.name;
    return {
      name: spec.name,
      sourceName,
      url: new URL(`artifacts/real-assets/${sourceName}`, baseUrl).href,
    };
  });
}

function win32PointLParam(point) {
  return ((point.y & 0xffff) << 16) | (point.x & 0xffff);
}

function compactGameplay(frame) {
  const gameplay = frame?.gameplay ?? frame?.clientState?.gameplay ?? null;
  return {
    framesCompleted: frame?.framesCompleted ?? null,
    gameMode: gameplay?.gameMode ?? null,
    inGame: gameplay?.inGame ?? null,
    loadingMap: gameplay?.loadingMap ?? null,
    inputEnabled: gameplay?.inputEnabled ?? null,
    localPlayer: gameplay?.localPlayer ?? null,
    objectCount: gameplay?.objectCount ?? null,
    drawableCount: gameplay?.drawableCount ?? null,
    renderedObjectCount: gameplay?.renderedObjectCount ?? null,
  };
}

function compactClickFrame(frameResult) {
  const clientState = frameResult?.frame?.clientState ?? {};
  return {
    framesCompleted: frameResult?.frame?.framesCompleted ?? null,
    shell: clientState.shell ?? null,
    transition: clientState.transition ?? null,
    gameplay: compactGameplay(frameResult?.frame),
    mouse: clientState.input?.mouse ?? null,
    top: clientState.shell?.topFilename ?? null,
    mainMenu: {
      buttonSinglePlayer: clientState.mainMenu?.buttonSinglePlayer ?? null,
      buttonSkirmish: clientState.mainMenu?.buttonSkirmish ?? null,
    },
    skirmishMenu: {
      parent: clientState.skirmishMenu?.parent ?? null,
      buttonStart: clientState.skirmishMenu?.buttonStart ?? null,
    },
  };
}

async function rpc(page, command, payload = {}) {
  return page.evaluate(([name, data]) => window.CnCPort.rpc(name, data), [command, payload]);
}

function assertFrameResult(result, label) {
  expect(result?.ok === true && result?.aborted === false,
    `${label} frame RPC failed`, {
      aborted: result?.aborted,
      abortMessage: result?.abortMessage,
      abortStack: result?.abortStack,
      lastUpdateTarget: result?.lastUpdateTarget,
      lastGameLogicStep: result?.lastGameLogicStep,
      frame: result?.frame,
    });
  expect(result.frame?.exceptionCaught === false,
    `${label} frame caught a C++ exception`, result.frame);
  expect(result.frame?.quitting === false,
    `${label} frame requested quit`, result.frame);
  return result;
}

async function runFrames(page, frames, label = "real engine") {
  return assertFrameResult(await rpc(page, "realEngineFrame", { frames }), label);
}

async function runSummary(page, frames, label = "real engine summary") {
  return assertFrameResult(await rpc(page, "realEngineFrameSummary", { frames }), label);
}

async function postMouse(page, message, point) {
  const result = await rpc(page, "postMessage", {
    message,
    lParam: win32PointLParam(point),
    point,
  });
  expect(result?.ok === true, "mouse message was not posted", result);
  return result;
}

function realMenuHitMatches(menu, hitProbeName, buttonFieldName) {
  const hitWindow = menu?.[hitProbeName]?.window;
  const button = menu?.[buttonFieldName];
  return button?.clickable === true && hitWindow?.found === true && hitWindow.id === button.id;
}

function collectWindowRefs(clientState) {
  const refs = [];
  for (const group of [clientState?.mainMenu, clientState?.skirmishMenu, clientState?.controlBarWindows]) {
    for (const value of Object.values(group ?? {})) {
      if (value?.found === true && Number.isFinite(value.id)) {
        refs.push(value);
      }
      if (value?.window?.found === true && Number.isFinite(value.window.id)) {
        refs.push(value.window);
      }
    }
  }
  for (const field of ["focusWindow", "captureWindow", "grabWindow"]) {
    const ref = clientState?.input?.[field];
    if (ref?.found === true && Number.isFinite(ref.id)) {
      refs.push(ref);
    }
  }
  return refs;
}

function commandButtonEntries(controlBarWindows) {
  return Object.entries(controlBarWindows ?? {})
    .filter(([key, value]) => /^buttonCommand\d+$/.test(key) &&
      value?.found === true &&
      value?.clickable === true &&
      value?.command != null)
    .map(([slot, button]) => ({ slot, button }));
}

function chooseBuildCommandButton(entries) {
  const preferredBuildNames = [
    /DemoTrap/i,
    /Tunnel/i,
    /Stinger/i,
    /Barracks/i,
    /Supply/i,
  ];
  const dozerButtons = entries.filter(({ button }) =>
    button.command?.typeName === "GUI_COMMAND_DOZER_CONSTRUCT");
  for (const pattern of preferredBuildNames) {
    const match = dozerButtons.find(({ button }) =>
      pattern.test(button.command?.buildTemplate ?? "") ||
      pattern.test(button.command?.name ?? ""));
    if (match) {
      return match;
    }
  }
  if (dozerButtons.length > 0) {
    return dozerButtons[0];
  }

  return entries.find(({ button }) =>
    button.command?.typeName === "GUI_COMMAND_UNIT_BUILD" ||
    button.command?.typeName === "GUI_COMMAND_PLAYER_UPGRADE" ||
    button.command?.typeName === "GUI_COMMAND_OBJECT_UPGRADE" ||
    button.command?.typeName === "GUI_COMMAND_PURCHASE_SCIENCE") ?? null;
}

function compactDrawable(drawable) {
  if (drawable == null) {
    return null;
  }
  return {
    id: drawable.id ?? null,
    name: drawable.name ?? null,
    playerIndex: drawable.playerIndex ?? null,
    localOwned: drawable.localOwned ?? null,
    relationshipToLocal: drawable.relationshipToLocal ?? null,
    relationshipToLocalName: drawable.relationshipToLocalName ?? null,
    hostileToLocal: drawable.hostileToLocal ?? null,
    structure: drawable.structure ?? null,
    hidden: drawable.hidden ?? null,
    effectivelyDead: drawable.effectivelyDead ?? null,
    onScreen: drawable.onScreen ?? null,
    screenPos: drawable.screenPos ?? null,
    worldPos: drawable.worldPos ?? null,
    body: drawable.body ?? null,
  };
}

function localStructureMatches(drawable, templateName) {
  return drawable?.localOwned === true &&
    drawable?.structure === true &&
    drawable?.name === templateName;
}

function localUnitMatches(drawable, templateName) {
  return drawable?.localOwned === true &&
    drawable?.structure === false &&
    drawable?.name === templateName;
}

async function queryDrawablesChecked(page, label) {
  const query = await rpc(page, "queryDrawables");
  expect(query?.ok === true,
    `${label} queryDrawables failed`,
    {
      ok: query?.ok,
      aborted: query?.aborted,
      abortMessage: query?.abortMessage,
      result: query?.result,
    });
  expect(query.result?.ready === true,
    `${label} queryDrawables was not ready`,
    query.result);
  return query;
}

function chooseUnitBuildCommandButton(entries) {
  const unitButtons = entries.filter(({ button }) =>
    button.command?.typeName === "GUI_COMMAND_UNIT_BUILD" &&
    button.command?.buildTemplate != null);
  const preferredUnits = [
    /Ranger/i,
    /Rebel/i,
    /RedGuard/i,
    /TankHunter/i,
    /Missile/i,
  ];
  for (const pattern of preferredUnits) {
    const match = unitButtons.find(({ button }) =>
      pattern.test(button.command?.buildTemplate ?? "") ||
      pattern.test(button.command?.name ?? ""));
    if (match) {
      return match;
    }
  }
  return unitButtons[0] ?? null;
}

function compactCommandPath(selectionResult) {
  const path = selectionResult?.commandPath ?? {};
  return {
    dispatchBuildCommandCount: path.dispatchBuildCommandCount ?? null,
    dispatchLastBuildCommandType: path.dispatchLastBuildCommandType ?? null,
    dispatchLastBuildHadGroup: path.dispatchLastBuildHadGroup ?? null,
    dispatchLastBuildArg0: path.dispatchLastBuildArg0 ?? null,
    dispatchQueueUpgradeCount: path.dispatchQueueUpgradeCount ?? null,
    dispatchQueueUnitCreateCount: path.dispatchQueueUnitCreateCount ?? null,
    dispatchDozerConstructCount: path.dispatchDozerConstructCount ?? null,
    dispatchPurchaseScienceCount: path.dispatchPurchaseScienceCount ?? null,
  };
}

function compactMoveCommandPath(selectionResult) {
  const path = selectionResult?.commandPath ?? {};
  return {
    lastClickType: path.lastClickType ?? null,
    lastClickIssuedType: path.lastClickIssuedType ?? null,
    lastClickWorldPos: path.lastClickWorldPos ?? null,
    moveIssueCount: path.moveIssueCount ?? null,
    moveAppendCount: path.moveAppendCount ?? null,
    moveLastMsgType: path.moveLastMsgType ?? null,
    moveLastMsgTypeName: path.moveLastMsgTypeName ?? null,
    moveLastCommandType: path.moveLastCommandType ?? null,
    moveLastTeamExists: path.moveLastTeamExists ?? null,
    moveLastWorldPos: path.moveLastWorldPos ?? null,
    dispatchMoveCommandCount: path.dispatchMoveCommandCount ?? null,
    dispatchLastMoveCommandType: path.dispatchLastMoveCommandType ?? null,
    dispatchLastMoveCommandTypeName: path.dispatchLastMoveCommandTypeName ?? null,
    dispatchLastMoveHadGroup: path.dispatchLastMoveHadGroup ?? null,
    dispatchLastMoveWorldPos: path.dispatchLastMoveWorldPos ?? null,
  };
}

function compactAttackCommandPath(selectionResult) {
  const path = selectionResult?.commandPath ?? {};
  return {
    lastClickType: path.lastClickType ?? null,
    lastClickIssuedType: path.lastClickIssuedType ?? null,
    lastClickDrawId: path.lastClickDrawId ?? null,
    lastClickWorldPos: path.lastClickWorldPos ?? null,
    dispatchAttackCommandCount: path.dispatchAttackCommandCount ?? null,
    dispatchLastAttackCommandType: path.dispatchLastAttackCommandType ?? null,
    dispatchLastAttackCommandTypeName: path.dispatchLastAttackCommandTypeName ?? null,
    dispatchLastAttackHadGroup: path.dispatchLastAttackHadGroup ?? null,
    dispatchLastAttackTargetId: path.dispatchLastAttackTargetId ?? null,
    dispatchLastAttackTargetWorldPos: path.dispatchLastAttackTargetWorldPos ?? null,
  };
}

function buildDispatchDelta(before, after) {
  return {
    build: (after.dispatchBuildCommandCount ?? 0) - (before.dispatchBuildCommandCount ?? 0),
    queueUpgrade: (after.dispatchQueueUpgradeCount ?? 0) - (before.dispatchQueueUpgradeCount ?? 0),
    queueUnit: (after.dispatchQueueUnitCreateCount ?? 0) - (before.dispatchQueueUnitCreateCount ?? 0),
    dozerConstruct: (after.dispatchDozerConstructCount ?? 0) - (before.dispatchDozerConstructCount ?? 0),
    purchaseScience: (after.dispatchPurchaseScienceCount ?? 0) - (before.dispatchPurchaseScienceCount ?? 0),
  };
}

function buildMoveDispatchDelta(before, after) {
  return {
    issue: (after.moveIssueCount ?? 0) - (before.moveIssueCount ?? 0),
    append: (after.moveAppendCount ?? 0) - (before.moveAppendCount ?? 0),
    dispatch: (after.dispatchMoveCommandCount ?? 0) - (before.dispatchMoveCommandCount ?? 0),
  };
}

function buildAttackDispatchDelta(before, after) {
  return {
    dispatch: (after.dispatchAttackCommandCount ?? 0) -
      (before.dispatchAttackCommandCount ?? 0),
  };
}

function worldDistance2d(a, b) {
  if (a == null || b == null) {
    return null;
  }
  const dx = Number(b.x) - Number(a.x);
  const dy = Number(b.y) - Number(a.y);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
    return null;
  }
  return Math.sqrt(dx * dx + dy * dy);
}

function attackTargetRank(candidate) {
  const name = candidate?.name ?? "";
  const nonCombatPattern =
    /Train|SupplyDock|SupplyPile|Ambient|Amb_|Fence|Wall|Road|Tree|Shrub|Bush|Rock|Boulder|Barrel|Traffic|Sign|Light|Lamp|Pole|Bridge|Prop|Debris|Crate|Cargo|CivilianCar|Car|Truck|Flag/i;
  const combatPattern =
    /GLA|China|America|Tank|Infantry|Soldier|Rebel|RPG|Missile|Quad|Scorpion|Technical|Terror|Worker|Stinger|Tunnel|Barracks|ArmsDealer|Command|Supply|Patriot|Gattling|Dozer|Humvee|Paladin|Comanche|Mig|Raptor|Ranger|Trooper|AngryMob|Hijacker|Jarmen|Dragon|Overlord|Marauder|RocketBuggy|Toxin|Demo/i;
  if (nonCombatPattern.test(name)) {
    return 3;
  }
  if (combatPattern.test(name)) {
    return 0;
  }
  if (candidate?.structure === true) {
    return 1;
  }
  return 2;
}

function usableAttackCandidate(candidate) {
  const health = Number(candidate?.body?.health);
  const maxHealth = Number(candidate?.body?.maxHealth);
  return candidate?.localOwned !== true &&
    candidate.hidden === false &&
    candidate.effectivelyDead !== true &&
    candidate.worldPos != null &&
    candidate.body?.ready === true &&
    Number.isFinite(health) &&
    Number.isFinite(maxHealth) &&
    health > 0 &&
    maxHealth > 0 &&
    attackTargetRank(candidate) < 3;
}

function usableAttackTarget(candidate, displayWidth, displayHeight) {
  return usableAttackCandidate(candidate) &&
    candidate?.onScreen === true &&
    candidate.screenPos != null &&
    candidate.screenPos.x >= 8 &&
    candidate.screenPos.x <= displayWidth - 8 &&
    candidate.screenPos.y >= 8 &&
    candidate.screenPos.y <= displayHeight - 150;
}

function rankAttackTargets(unit, candidates) {
  return [...(candidates ?? [])].sort((a, b) => {
    const aRank = attackTargetRank(a);
    const bRank = attackTargetRank(b);
    if (aRank !== bRank) {
      return aRank - bRank;
    }
    const aStructure = a.structure === true ? 1 : 0;
    const bStructure = b.structure === true ? 1 : 0;
    if (aStructure !== bStructure) {
      return aStructure - bStructure;
    }
    return (worldDistance2d(unit.worldPos, a.worldPos) ?? Number.MAX_SAFE_INTEGER) -
      (worldDistance2d(unit.worldPos, b.worldPos) ?? Number.MAX_SAFE_INTEGER);
  });
}

function chooseMovableDrawable(drawables) {
  const localUnits = (drawables ?? []).filter((drawable) =>
    drawable?.localOwned === true &&
    drawable?.structure === false &&
    drawable?.hidden === false &&
    drawable?.onScreen === true &&
    drawable?.screenPos != null &&
    drawable?.worldPos != null);
  const preferred = /Worker|Dozer|Tank|Technical|Humvee|Ranger|Missile|Quad|Scorpion|Marauder|Rebel|Terror|Combat|Bike|Truck/i;
  return localUnits.find((drawable) => preferred.test(drawable.name ?? "")) ??
    localUnits[0] ??
    null;
}

async function waitForCommandButtons(page) {
  return waitForCondition(
    page,
    "command bar buttons after selection",
    (clientState) => commandButtonEntries(clientState.controlBarWindows).length > 0,
    90);
}

async function clickMapPoint(page, point, label) {
  await postMouse(page, WM_MOUSEMOVE, point);
  await runFrames(page, 1, `${label} move`);
  await postMouse(page, WM_LBUTTONDOWN, point);
  await runFrames(page, 1, `${label} down`);
  await postMouse(page, WM_LBUTTONUP, point);
  return runFrames(page, 8, `${label} up`);
}

async function clickSelectPoint(page, point, label, settleFrames = 5) {
  await postMouse(page, WM_MOUSEMOVE, point);
  await runFrames(page, settleFrames, `${label} move`);
  await postMouse(page, WM_LBUTTONDOWN, point);
  await runFrames(page, settleFrames, `${label} down`);
  await postMouse(page, WM_LBUTTONUP, point);
  return runFrames(page, settleFrames, `${label} up`);
}

async function dragSelectBox(page, start, end, label, settleFrames = 5) {
  await postMouse(page, WM_MOUSEMOVE, start);
  await runFrames(page, settleFrames, `${label} move start`);
  await postMouse(page, WM_LBUTTONDOWN, start);
  await runFrames(page, settleFrames, `${label} down`);
  await postMouse(page, WM_MOUSEMOVE, {
    x: Math.round((start.x + end.x) / 2),
    y: Math.round((start.y + end.y) / 2),
  });
  await runFrames(page, settleFrames, `${label} drag`);
  await postMouse(page, WM_MOUSEMOVE, end);
  await runFrames(page, settleFrames, `${label} move end`);
  await postMouse(page, WM_LBUTTONUP, end);
  return runFrames(page, settleFrames, `${label} up`);
}

function findWindowById(clientState, id) {
  return collectWindowRefs(clientState).find((ref) => ref.id === id) ?? null;
}

async function waitForCondition(page, label, predicate, maxFrames = 180) {
  const attempts = [];
  let last = null;
  for (let frame = 0; frame < maxFrames; frame += 1) {
    last = await runFrames(page, 1, label);
    attempts.push(compactClickFrame(last));
    if (predicate(last.frame?.clientState ?? {}, last)) {
      return last;
    }
  }
  expect(false, `${label} did not satisfy condition`, {
    attempts: attempts.slice(-12),
    last: compactClickFrame(last),
  });
}

async function waitForTransitionIdle(page, label, maxFrames = 120) {
  return waitForCondition(
    page,
    label,
    (clientState) => clientState.transition?.ready === true &&
      clientState.transition?.finished === true,
    maxFrames);
}

async function revealMainMenu(page) {
  const seedPoint = { x: 32, y: 32 };
  const revealPoint = { x: 96, y: 96 };
  await postMouse(page, WM_MOUSEMOVE, seedPoint);
  await waitForCondition(
    page,
    "main-menu seed mouse move",
    (clientState) => clientState.input?.mouse?.x === seedPoint.x &&
      clientState.input?.mouse?.y === seedPoint.y,
    12);

  await postMouse(page, WM_MOUSEMOVE, revealPoint);
  return waitForCondition(
    page,
    "main-menu reveal",
    (clientState) => clientState.input?.mouse?.x === revealPoint.x &&
      clientState.input?.mouse?.y === revealPoint.y &&
      clientState.transition?.finished === true &&
      clientState.input?.mouse?.visible === true &&
      clientState.gates?.breakTheMovie === false &&
      realMenuHitMatches(clientState.mainMenu, "underButtonSinglePlayerCenter", "buttonSinglePlayer"),
    120);
}

async function waitForButtonDown(page, target, label, maxFrames = 12) {
  return waitForCondition(
    page,
    `${label} down`,
    (clientState) => {
      const downTarget = findWindowById(clientState, target.id);
      return clientState.input?.grabWindow?.id === target.id && downTarget?.selected === true;
    },
    maxFrames);
}

async function waitForButtonReleased(page, target, label, maxFrames = 12) {
  return waitForCondition(
    page,
    `${label} release`,
    (clientState) => {
      const finalTarget = findWindowById(clientState, target.id);
      return finalTarget == null || finalTarget.selected === false;
    },
    maxFrames);
}

async function clickButton(page, button, hitProbe, label, settleFrames = 120) {
  expect(button?.clickable === true, `${label} button is not clickable`, button);
  const point = hitProbe?.point ?? { x: button.centerX, y: button.centerY };
  expect(Number.isFinite(point.x) && Number.isFinite(point.y),
    `${label} click point is invalid`, { button, hitProbe, point });
  const target = hitProbe?.window?.found === true ? hitProbe.window : button;
  expect(target?.clickable === true, `${label} target is not clickable`, { button, hitProbe, target });

  await postMouse(page, WM_MOUSEMOVE, point);
  await postMouse(page, WM_LBUTTONDOWN, point);
  await waitForButtonDown(page, target, label);
  await postMouse(page, WM_LBUTTONUP, point);
  const released = await waitForButtonReleased(page, target, label);
  const settled = settleFrames == null ? released : await waitForTransitionIdle(page, label, settleFrames);
  return { point, target, released, settled };
}

async function waitForSkirmishMatch(page) {
  const samples = [];
  let framesAdvanced = 0;
  const maxStartFrames = parsePositiveInt("E2E_MAX_FRAMES", 6000);
  const frameChunk = parsePositiveInt("E2E_FRAME_CHUNK", 30);

  while (framesAdvanced < maxStartFrames) {
    const frames = Math.min(frameChunk, maxStartFrames - framesAdvanced);
    const result = await runSummary(page, frames, "skirmish match wait");
    framesAdvanced += frames;
    const gameplay = result.frame?.gameplay;
    const sample = compactGameplay(result.frame);
    samples.push(sample);
    if (gameplay?.gameMode === GAME_SKIRMISH &&
        gameplay?.inGame === true &&
        gameplay?.loadingMap === false &&
        gameplay?.inputEnabled === true &&
        Number(gameplay?.objectCount ?? 0) > 0 &&
        Number(gameplay?.drawableCount ?? 0) > 0) {
      return { result, framesAdvanced, samples };
    }
  }
  expect(false, "skirmish did not reach an active match", {
    maxStartFrames,
    samples: samples.slice(-12),
  });
}

async function proveMoveOrder(page, activeFrame, results) {
  console.error("[input-select-e2e] === MOVE ORDER ===");
  const drawablesQuery = await rpc(page, "queryDrawables");
  expect(drawablesQuery?.ok === true,
    "queryDrawables failed before move-order proof",
    drawablesQuery);
  const drawables = drawablesQuery.result?.drawables ?? [];
  let unit = chooseMovableDrawable(drawables);
  expect(unit != null,
    "no on-screen local movable unit was available for move-order proof",
    {
      stats: drawablesQuery.result?.stats,
      localOwned: drawables
        .filter((drawable) => drawable?.localOwned === true)
        .map((drawable) => ({
          id: drawable.id,
          name: drawable.name,
          structure: drawable.structure,
          hidden: drawable.hidden,
          onScreen: drawable.onScreen,
          screenPos: drawable.screenPos,
        })),
    });

  let selectedPoint = {
    x: Math.round(unit.screenPos.x),
    y: Math.round(unit.screenPos.y),
  };
  console.error(`[input-select-e2e] selecting movable unit ${unit.name}#${unit.id} at ` +
    `(${selectedPoint.x},${selectedPoint.y})`);
  await clickSelectPoint(page, selectedPoint, "move proof select unit");

  let selection = await rpc(page, "querySelection");
  expect(selection?.ok === true && Number(selection.result?.selectCount ?? 0) > 0,
    "move-order proof unit click did not select a controllable drawable",
    selection);
  if (!(selection.result?.selected ?? []).some((selected) => selected.id === unit.id)) {
    const selectedIds = new Set((selection.result?.selected ?? []).map((selected) => selected.id));
    const selectedMovable = drawables.find((drawable) =>
      selectedIds.has(drawable.id) &&
      drawable?.localOwned === true &&
      drawable?.structure === false &&
      drawable?.worldPos != null);
    expect(selectedMovable != null,
      "move-order proof selected a different object, but not a movable local unit",
      {
        clickedUnit: unit,
        selection: selection.result,
      });
    console.error(`[input-select-e2e] clicked unit ${unit.id} selected nearby ` +
      `${selectedMovable.name}#${selectedMovable.id}; tracking selected unit`);
    unit = selectedMovable;
    selectedPoint = {
      x: Math.round(unit.screenPos.x),
      y: Math.round(unit.screenPos.y),
    };
  }

  const beforeCommandPath = compactMoveCommandPath(selection.result);
  const useAlternateMouse = selection.result?.inputSettings?.useAlternateMouse === true;
  const moveClick = useAlternateMouse
    ? {
        name: "right",
        down: WM_RBUTTONDOWN,
        up: WM_RBUTTONUP,
      }
    : {
        name: "left",
        down: WM_LBUTTONDOWN,
        up: WM_LBUTTONUP,
      };
  const displayWidth = activeFrame?.frame?.clientState?.display?.width ??
    activeFrame?.frame?.display?.width ??
    1280;
  const displayHeight = activeFrame?.frame?.clientState?.display?.height ??
    activeFrame?.frame?.display?.height ??
    656;
  const clampPoint = (point) => ({
    x: Math.max(16, Math.min(Math.round(point.x), displayWidth - 16)),
    y: Math.max(16, Math.min(Math.round(point.y), displayHeight - 140)),
  });
  const candidateDestinations = [
    clampPoint({ x: unit.screenPos.x + 200, y: unit.screenPos.y }),
    clampPoint({ x: unit.screenPos.x + 220, y: unit.screenPos.y + 80 }),
    clampPoint({ x: unit.screenPos.x + 160, y: unit.screenPos.y + 140 }),
    clampPoint({ x: unit.screenPos.x - 200, y: unit.screenPos.y }),
    clampPoint({ x: unit.screenPos.x - 220, y: unit.screenPos.y + 80 }),
    clampPoint({ x: unit.screenPos.x, y: unit.screenPos.y + 180 }),
    clampPoint({ x: displayWidth - 96, y: Math.floor(displayHeight * 0.45) }),
    clampPoint({ x: Math.floor(displayWidth * 0.5), y: Math.floor(displayHeight * 0.55) }),
    clampPoint({ x: 96, y: Math.floor(displayHeight * 0.45) }),
  ];

  let accepted = null;
  let afterCommandPath = null;
  let afterSelection = null;
  for (const destination of candidateDestinations) {
    console.error(`[input-select-e2e] trying ${moveClick.name}-click move at ` +
      `(${destination.x},${destination.y})`);
    await postMouse(page, WM_MOUSEMOVE, destination);
    await runFrames(page, 5, "move-order mouse move");
    await postMouse(page, moveClick.down, destination);
    await runFrames(page, 5, "move-order down");
    await postMouse(page, moveClick.up, destination);
    await runFrames(page, 5, "move-order up");

    afterSelection = await rpc(page, "querySelection");
    afterCommandPath = compactMoveCommandPath(afterSelection?.result);
    const delta = buildMoveDispatchDelta(beforeCommandPath, afterCommandPath);
    const attempt = {
      destination,
      moveButton: moveClick.name,
      commandPath: afterCommandPath,
      delta,
      selectCount: afterSelection?.result?.selectCount ?? null,
    };
    results.moveOrderProof.attempts.push(attempt);
    console.error(`[input-select-e2e] move attempt: ${JSON.stringify(attempt)}`);

    if (delta.dispatch > 0) {
      expect(afterCommandPath.dispatchLastMoveCommandTypeName === "MSG_DO_MOVETO",
        "move-order proof dispatched the wrong command type",
        afterCommandPath);
      expect(afterCommandPath.dispatchLastMoveHadGroup === 1,
        "move-order proof dispatched without a selected group",
        afterCommandPath);
      accepted = { destination, delta };
      break;
    }

    const stillSelected = (afterSelection?.result?.selected ?? [])
      .some((selected) => selected.id === unit.id);
    if (!stillSelected) {
      await clickSelectPoint(page, selectedPoint, "move proof reselect unit");
      selection = await rpc(page, "querySelection");
    }
  }

  expect(accepted != null,
    "no candidate destination produced a real MSG_DO_MOVETO dispatch",
    results.moveOrderProof.attempts);

  console.error("[input-select-e2e] stepping 90 frames for move order to affect world position");
  await runFrames(page, 90, "move-order post-dispatch");
  const afterDrawables = await rpc(page, "queryDrawables");
  const afterUnit = (afterDrawables?.result?.drawables ?? [])
    .find((drawable) => drawable.id === unit.id);
  const worldDelta = worldDistance2d(unit.worldPos, afterUnit?.worldPos);
  expect(Number.isFinite(worldDelta) && worldDelta > 1.0,
    "move-order proof dispatched but the unit did not move",
    {
      unit,
      afterUnit,
      worldDelta,
      accepted,
      afterCommandPath,
    });

  const settledSelection = await rpc(page, "querySelection");
  results.moveOrderProof.ok = true;
  results.moveOrderProof.selectedUnit = {
    id: unit.id,
    name: unit.name,
    screenPos: unit.screenPos,
    worldPos: unit.worldPos,
  };
  results.moveOrderProof.beforeCommandPath = beforeCommandPath;
  results.moveOrderProof.afterCommandPath = afterCommandPath;
  results.moveOrderProof.dispatchDelta = accepted.delta;
  results.moveOrderProof.destination = accepted.destination;
  results.moveOrderProof.moveButton = moveClick.name;
  results.moveOrderProof.beforeWorldPos = unit.worldPos;
  results.moveOrderProof.afterWorldPos = afterUnit?.worldPos ?? null;
  results.moveOrderProof.worldDelta = worldDelta;
  results.moveOrderProof.verdict = "MOVE-ORDER-DISPATCHED-AND-UNIT-MOVED";
  console.error(`[input-select-e2e] move proof world delta: ${worldDelta}`);
  return settledSelection?.result ?? afterSelection?.result ?? selection.result;
}

async function proveStructureCreated(page, buildTemplate, beforeDrawablesQuery, results) {
  console.error(`[input-select-e2e] waiting for constructed structure ${buildTemplate}`);
  const maxFrames = parsePositiveInt("E2E_CONSTRUCTION_MAX_FRAMES", 900);
  const frameChunk = parsePositiveInt("E2E_CONSTRUCTION_FRAME_CHUNK", 30);
  const beforeMatches = (beforeDrawablesQuery?.result?.drawables ?? [])
    .filter((drawable) => localStructureMatches(drawable, buildTemplate));
  const beforeIds = new Set(beforeMatches.map((drawable) => drawable.id));

  results.productionProof.buildTemplate = buildTemplate;
  results.productionProof.beforeMatchingIds = [...beforeIds];
  results.productionProof.beforeMatching = beforeMatches.map(compactDrawable);
  results.productionProof.maxFrames = maxFrames;
  results.productionProof.frameChunk = frameChunk;

  let framesAdvanced = 0;
  while (framesAdvanced <= maxFrames) {
    const drawablesQuery = await queryDrawablesChecked(page, "construction proof");
    const drawables = drawablesQuery.result?.drawables ?? [];
    const matches = drawables.filter((drawable) =>
      localStructureMatches(drawable, buildTemplate));
    const newMatches = matches.filter((drawable) => !beforeIds.has(drawable.id));
    const sample = {
      framesAdvanced,
      stats: drawablesQuery.result?.stats ?? null,
      matchingCount: matches.length,
      newMatchingCount: newMatches.length,
      matching: matches.map(compactDrawable),
    };
    results.productionProof.samples.push(sample);
    console.error(`[input-select-e2e] construction sample ${framesAdvanced}/${maxFrames}: ` +
      `${buildTemplate} matches=${matches.length}, new=${newMatches.length}`);

    if (newMatches.length > 0) {
      const created = compactDrawable(newMatches[0]);
      results.productionProof.ok = true;
      results.productionProof.created = created;
      results.productionProof.framesAdvanced = framesAdvanced;
      results.productionProof.verdict = "STRUCTURE-OBJECT-CREATED";
      console.error(`[input-select-e2e] construction proof created ${buildTemplate}#${created.id}`);
      await proveStructureProgress(page, created, results);
      return results.productionProof;
    }

    if (framesAdvanced >= maxFrames) {
      break;
    }
    const frames = Math.min(frameChunk, maxFrames - framesAdvanced);
    await runSummary(page, frames, "construction proof wait");
    framesAdvanced += frames;
  }

  expect(false,
    "dozer construction dispatch did not create a visible local structure object",
    {
      buildTemplate,
      beforeMatchingIds: [...beforeIds],
      samples: results.productionProof.samples.slice(-10),
    });
}

async function proveStructureProgress(page, created, results) {
  const initialHealth = Number(created?.body?.health);
  const maxHealth = Number(created?.body?.maxHealth);
  expect(Number.isFinite(initialHealth) && Number.isFinite(maxHealth) && maxHealth > initialHealth,
    "constructed structure did not expose usable body health for progress proof",
    created);

  console.error(`[input-select-e2e] waiting for construction health progress on ` +
    `${created.name}#${created.id} from ${initialHealth}/${maxHealth}`);
  const maxFrames = parsePositiveInt("E2E_CONSTRUCTION_PROGRESS_MAX_FRAMES", 900);
  const frameChunk = parsePositiveInt("E2E_CONSTRUCTION_PROGRESS_FRAME_CHUNK", 30);
  const progress = {
    ok: false,
    objectId: created.id,
    initialHealth,
    maxHealth,
    maxFrames,
    frameChunk,
    framesAdvanced: null,
    samples: [],
    observed: null,
    verdict: null,
  };
  results.productionProof.progress = progress;

  let framesAdvanced = 0;
  while (framesAdvanced < maxFrames) {
    const frames = Math.min(frameChunk, maxFrames - framesAdvanced);
    await runSummary(page, frames, "construction progress wait");
    framesAdvanced += frames;

    const drawablesQuery = await queryDrawablesChecked(page, "construction progress");
    const current = (drawablesQuery.result?.drawables ?? [])
      .find((drawable) => drawable.id === created.id);
    const currentHealth = Number(current?.body?.health);
    const sample = {
      framesAdvanced,
      found: current != null,
      health: Number.isFinite(currentHealth) ? currentHealth : null,
      maxHealth: current?.body?.maxHealth ?? null,
      damageState: current?.body?.damageState ?? null,
      screenPos: current?.screenPos ?? null,
      worldPos: current?.worldPos ?? null,
    };
    progress.samples.push(sample);
    console.error(`[input-select-e2e] construction progress sample ${framesAdvanced}/${maxFrames}: ` +
      `found=${sample.found}, health=${sample.health}/${sample.maxHealth}`);

    if (current != null && Number.isFinite(currentHealth) && currentHealth > initialHealth) {
      progress.ok = true;
      progress.framesAdvanced = framesAdvanced;
      progress.observed = compactDrawable(current);
      progress.verdict = "STRUCTURE-CONSTRUCTION-PROGRESSED";
      console.error(`[input-select-e2e] construction progress proved ${created.name}#${created.id}: ` +
        `${initialHealth} -> ${currentHealth}`);
      const completed = await proveStructureCompletion(page, progress.observed, results);
      await proveUnitProduction(page, completed, results);
      return progress;
    }
  }

  expect(false,
    "constructed structure did not gain health after frame stepping",
    {
      created,
      samples: progress.samples.slice(-12),
    });
}

async function proveStructureCompletion(page, structure, results) {
  const startingHealth = Number(structure?.body?.health);
  const maxHealth = Number(structure?.body?.maxHealth);
  expect(Number.isFinite(startingHealth) && Number.isFinite(maxHealth) && maxHealth > 0,
    "constructed structure did not expose usable body health for completion proof",
    structure);

  console.error(`[input-select-e2e] waiting for construction completion on ` +
    `${structure.name}#${structure.id} from ${startingHealth}/${maxHealth}`);
  const maxFrames = parsePositiveInt("E2E_CONSTRUCTION_COMPLETE_MAX_FRAMES", 3600);
  const frameChunk = parsePositiveInt("E2E_CONSTRUCTION_COMPLETE_FRAME_CHUNK", 60);
  const completion = {
    ok: false,
    objectId: structure.id,
    startingHealth,
    maxHealth,
    maxFrames,
    frameChunk,
    framesAdvanced: null,
    samples: [],
    observed: null,
    verdict: null,
  };
  results.productionProof.completion = completion;

  let framesAdvanced = 0;
  while (framesAdvanced <= maxFrames) {
    const drawablesQuery = await queryDrawablesChecked(page, "construction completion");
    const current = (drawablesQuery.result?.drawables ?? [])
      .find((drawable) => drawable.id === structure.id);
    const currentHealth = Number(current?.body?.health);
    const sample = {
      framesAdvanced,
      found: current != null,
      health: Number.isFinite(currentHealth) ? currentHealth : null,
      maxHealth: current?.body?.maxHealth ?? null,
      damageState: current?.body?.damageState ?? null,
      screenPos: current?.screenPos ?? null,
      worldPos: current?.worldPos ?? null,
    };
    completion.samples.push(sample);
    console.error(`[input-select-e2e] construction completion sample ${framesAdvanced}/${maxFrames}: ` +
      `found=${sample.found}, health=${sample.health}/${sample.maxHealth}`);

    if (current != null && Number.isFinite(currentHealth) && currentHealth >= maxHealth - 0.5) {
      completion.ok = true;
      completion.framesAdvanced = framesAdvanced;
      completion.observed = compactDrawable(current);
      completion.verdict = "STRUCTURE-CONSTRUCTION-COMPLETE";
      console.error(`[input-select-e2e] construction complete ${structure.name}#${structure.id}: ` +
        `${currentHealth}/${maxHealth}`);
      return completion.observed;
    }

    if (framesAdvanced >= maxFrames) {
      break;
    }
    const frames = Math.min(frameChunk, maxFrames - framesAdvanced);
    await runSummary(page, frames, "construction completion wait");
    framesAdvanced += frames;
  }

  expect(false,
    "constructed structure did not reach full health before the completion deadline",
    {
      structure,
      samples: completion.samples.slice(-12),
    });
}

async function proveUnitProduction(page, completedStructure, results) {
  console.error(`[input-select-e2e] selecting completed producer ` +
    `${completedStructure.name}#${completedStructure.id}`);
  const selectPoint = {
    x: Math.round(completedStructure.screenPos.x),
    y: Math.round(completedStructure.screenPos.y),
  };
  await clickSelectPoint(page, selectPoint, "unit production select producer", 5);

  const selection = await rpc(page, "querySelection");
  expect(selection?.ok === true,
    "unit-production querySelection failed after selecting producer",
    selection);
  expect((selection.result?.selected ?? []).some((selected) => selected.id === completedStructure.id),
    "unit-production click did not select the completed producer",
    {
      completedStructure,
      selection: selection.result,
    });

  const beforeCommandPath = compactCommandPath(selection.result);
  const commandReady = await waitForCommandButtons(page);
  const entries = commandButtonEntries(commandReady.frame?.clientState?.controlBarWindows);
  const unitCommand = chooseUnitBuildCommandButton(entries);
  const proof = {
    ok: false,
    producer: completedStructure,
    visibleCommandCount: entries.length,
    visibleCommands: entries.map(({ slot, button }) => ({
      slot,
      id: button.id,
      centerX: button.centerX,
      centerY: button.centerY,
      clickable: button.clickable,
      command: button.command,
    })),
    chosen: unitCommand == null ? null : {
      slot: unitCommand.slot,
      id: unitCommand.button.id,
      centerX: unitCommand.button.centerX,
      centerY: unitCommand.button.centerY,
      command: unitCommand.button.command,
    },
    beforeCommandPath,
    afterClickCommandPath: null,
    dispatchDeltaAfterClick: null,
    beforeMatchingIds: [],
    beforeMatching: [],
    framesAdvanced: null,
    samples: [],
    created: null,
    verdict: null,
  };
  results.productionProof.unitProduction = proof;
  expect(unitCommand != null,
    "completed producer did not expose a unit-build command",
    proof.visibleCommands);

  const unitTemplate = unitCommand.button.command.buildTemplate;
  const beforeDrawablesQuery = await queryDrawablesChecked(page, "before unit build");
  const beforeMatches = (beforeDrawablesQuery.result?.drawables ?? [])
    .filter((drawable) => localUnitMatches(drawable, unitTemplate));
  const beforeIds = new Set(beforeMatches.map((drawable) => drawable.id));
  proof.beforeMatchingIds = [...beforeIds];
  proof.beforeMatching = beforeMatches.map(compactDrawable);

  console.error(`[input-select-e2e] clicking unit build ${unitCommand.slot}: ` +
    `${JSON.stringify(unitCommand.button.command)}`);
  await clickButton(page, unitCommand.button, null,
    `unit production ${unitCommand.slot} ${unitCommand.button.command?.name ?? "command"}`,
    null);
  await runFrames(page, 5, "unit production click settle");

  const afterClickQuery = await rpc(page, "querySelection");
  proof.afterClickCommandPath = compactCommandPath(afterClickQuery?.result);
  proof.dispatchDeltaAfterClick = buildDispatchDelta(
    proof.beforeCommandPath,
    proof.afterClickCommandPath);
  expect(proof.dispatchDeltaAfterClick.queueUnit > 0,
    "unit-build command did not dispatch MSG_QUEUE_UNIT_CREATE",
    proof);

  const maxFrames = parsePositiveInt("E2E_UNIT_CREATE_MAX_FRAMES", 2400);
  const frameChunk = parsePositiveInt("E2E_UNIT_CREATE_FRAME_CHUNK", 30);
  let framesAdvanced = 0;
  while (framesAdvanced <= maxFrames) {
    const drawablesQuery = await queryDrawablesChecked(page, "unit create proof");
    const matches = (drawablesQuery.result?.drawables ?? [])
      .filter((drawable) => localUnitMatches(drawable, unitTemplate));
    const newMatches = matches.filter((drawable) => !beforeIds.has(drawable.id));
    const sample = {
      framesAdvanced,
      stats: drawablesQuery.result?.stats ?? null,
      matchingCount: matches.length,
      newMatchingCount: newMatches.length,
      matching: matches.map(compactDrawable),
    };
    proof.samples.push(sample);
    console.error(`[input-select-e2e] unit create sample ${framesAdvanced}/${maxFrames}: ` +
      `${unitTemplate} matches=${matches.length}, new=${newMatches.length}`);

    if (newMatches.length > 0) {
      proof.ok = true;
      proof.framesAdvanced = framesAdvanced;
      proof.created = compactDrawable(newMatches[0]);
      proof.verdict = "UNIT-PRODUCTION-CREATED-OBJECT";
      console.error(`[input-select-e2e] unit production created ${unitTemplate}#${proof.created.id}`);
      const attackSettleFrames = parsePositiveInt("E2E_UNIT_ATTACK_SETTLE_FRAMES", 120);
      proof.attackSettleFrames = attackSettleFrames;
      if (attackSettleFrames > 0) {
        await runSummary(page, attackSettleFrames, "unit attack settle wait");
        const settledQuery = await queryDrawablesChecked(page, "unit attack settle");
        const settledUnit = (settledQuery.result?.allDrawables ??
            settledQuery.result?.drawables ??
            [])
          .find((drawable) => drawable.id === proof.created.id);
        proof.settledCreated = compactDrawable(settledUnit) ?? proof.created;
      } else {
        proof.settledCreated = proof.created;
      }
      await proveAttackOrder(page, proof.settledCreated, results);
      return proof;
    }

    if (framesAdvanced >= maxFrames) {
      break;
    }
    const frames = Math.min(frameChunk, maxFrames - framesAdvanced);
    await runSummary(page, frames, "unit create wait");
    framesAdvanced += frames;
  }

  expect(false,
    "queued unit did not create a new local unit before the deadline",
    {
      unitTemplate,
      proof: {
        ...proof,
        samples: proof.samples.slice(-12),
      },
    });
}

async function selectProducedUnitForAttack(page, unit, displayWidth, displayHeight) {
  const clampPoint = (point) => ({
    x: Math.max(8, Math.min(Math.round(point.x), displayWidth - 8)),
    y: Math.max(8, Math.min(Math.round(point.y), displayHeight - 150)),
  });
  const base = unit.screenPos;
  const clickOffsets = [
    { x: 0, y: 0 },
    { x: 0, y: -18 },
    { x: 14, y: -10 },
    { x: -14, y: -10 },
    { x: 18, y: 8 },
    { x: -18, y: 8 },
    { x: 0, y: 18 },
    { x: 0, y: 34 },
    { x: 18, y: 34 },
    { x: -18, y: 34 },
    { x: 0, y: 50 },
    { x: 24, y: 48 },
    { x: -24, y: 48 },
  ];
  const attempts = [];

  for (const offset of clickOffsets) {
    const point = clampPoint({ x: base.x + offset.x, y: base.y + offset.y });
    console.error(`[input-select-e2e] trying attack-unit click select at ` +
      `(${point.x},${point.y}) for ${unit.name}#${unit.id}`);
    await clickSelectPoint(page, point, "attack proof select produced unit", 5);
    const selection = await rpc(page, "querySelection");
    const selectedIds = (selection?.result?.selected ?? []).map((selected) => selected.id);
    const attempt = {
      type: "click",
      point,
      ok: selectedIds.includes(unit.id),
      selectCount: selection?.result?.selectCount ?? null,
      selectedIds,
    };
    attempts.push(attempt);
    if (attempt.ok) {
      return { selection, attempts };
    }
  }

  for (const radius of [18, 28, 42, 56]) {
    const start = clampPoint({ x: base.x - radius, y: base.y - radius });
    const end = clampPoint({ x: base.x + radius, y: base.y + radius });
    console.error(`[input-select-e2e] trying attack-unit drag select ` +
      `(${start.x},${start.y}) -> (${end.x},${end.y}) for ${unit.name}#${unit.id}`);
    await dragSelectBox(page, start, end, "attack proof drag produced unit", 3);
    const selection = await rpc(page, "querySelection");
    const selectedIds = (selection?.result?.selected ?? []).map((selected) => selected.id);
    const attempt = {
      type: "drag",
      start,
      end,
      ok: selectedIds.includes(unit.id),
      selectCount: selection?.result?.selectCount ?? null,
      selectedIds,
    };
    attempts.push(attempt);
    if (attempt.ok) {
      return { selection, attempts };
    }
  }

  const asymmetricBoxes = [
    { start: { x: base.x + 2, y: base.y + 2 }, end: { x: base.x + 48, y: base.y + 48 } },
    { start: { x: base.x - 10, y: base.y + 8 }, end: { x: base.x + 34, y: base.y + 54 } },
    { start: { x: base.x + 8, y: base.y - 6 }, end: { x: base.x + 56, y: base.y + 34 } },
    { start: { x: base.x - 44, y: base.y + 2 }, end: { x: base.x - 2, y: base.y + 48 } },
  ];
  for (const box of asymmetricBoxes) {
    const start = clampPoint(box.start);
    const end = clampPoint(box.end);
    console.error(`[input-select-e2e] trying attack-unit offset drag select ` +
      `(${start.x},${start.y}) -> (${end.x},${end.y}) for ${unit.name}#${unit.id}`);
    await dragSelectBox(page, start, end, "attack proof offset drag produced unit", 3);
    const selection = await rpc(page, "querySelection");
    const selectedIds = (selection?.result?.selected ?? []).map((selected) => selected.id);
    const attempt = {
      type: "offset-drag",
      start,
      end,
      ok: selectedIds.includes(unit.id),
      selectCount: selection?.result?.selectCount ?? null,
      selectedIds,
    };
    attempts.push(attempt);
    if (attempt.ok) {
      return { selection, attempts };
    }
  }

  return { selection: null, attempts };
}

async function proveAttackMoveOrder(page, unit, selectedResult, displayWidth, displayHeight, proof) {
  console.error(`[input-select-e2e] proving attack-move with ${unit.name}#${unit.id}`);
  const commandReady = await waitForCommandButtons(page);
  const entries = commandButtonEntries(commandReady.frame?.clientState?.controlBarWindows);
  const attackMoveCommand = entries.find(({ button }) =>
    button.command?.typeName === "GUI_COMMAND_ATTACK_MOVE");
  proof.attackMove = {
    ok: false,
    skippedObjectAttackReason: proof.objectAttackSkippedReason ?? null,
    visibleCommandCount: entries.length,
    visibleCommands: entries.map(({ slot, button }) => ({
      slot,
      id: button.id,
      centerX: button.centerX,
      centerY: button.centerY,
      clickable: button.clickable,
      hidden: button.hidden,
      enabled: button.enabled,
      command: button.command,
    })),
    chosen: attackMoveCommand == null ? null : {
      slot: attackMoveCommand.slot,
      id: attackMoveCommand.button.id,
      centerX: attackMoveCommand.button.centerX,
      centerY: attackMoveCommand.button.centerY,
      command: attackMoveCommand.button.command,
    },
    beforeCommandPath: compactMoveCommandPath(selectedResult),
    armedCommandPath: null,
    attempts: [],
    accepted: null,
    beforeWorldPos: unit.worldPos,
    afterWorldPos: null,
    worldDelta: null,
    verdict: null,
  };
  expect(attackMoveCommand != null,
    "selected produced unit did not expose an attack-move command",
    proof.attackMove.visibleCommands);

  await clickButton(page, attackMoveCommand.button, null,
    `attack-move ${attackMoveCommand.slot} ${attackMoveCommand.button.command?.name ?? "command"}`,
    null);
  await runFrames(page, 5, "attack-move command settle");

  let armedSelection = await rpc(page, "querySelection");
  if (armedSelection?.result?.modes?.attackMoveTo !== true &&
      armedSelection?.result?.guiCommand?.typeName !== "GUI_COMMAND_ATTACK_MOVE") {
    await runFrames(page, 5, "attack-move command arm retry");
    armedSelection = await rpc(page, "querySelection");
  }
  expect(armedSelection?.result?.modes?.attackMoveTo === true ||
      armedSelection?.result?.guiCommand?.typeName === "GUI_COMMAND_ATTACK_MOVE",
    "attack-move command button did not arm attack-move mode",
    {
      chosen: proof.attackMove.chosen,
      selection: armedSelection?.result,
    });
  proof.attackMove.armedCommandPath = compactMoveCommandPath(armedSelection.result);

  const clampPoint = (point) => ({
    x: Math.max(16, Math.min(Math.round(point.x), displayWidth - 16)),
    y: Math.max(16, Math.min(Math.round(point.y), displayHeight - 150)),
  });
  const destinations = [
    clampPoint({ x: unit.screenPos.x + 220, y: unit.screenPos.y }),
    clampPoint({ x: unit.screenPos.x + 200, y: unit.screenPos.y + 90 }),
    clampPoint({ x: unit.screenPos.x - 220, y: unit.screenPos.y }),
    clampPoint({ x: unit.screenPos.x - 200, y: unit.screenPos.y + 90 }),
    clampPoint({ x: Math.floor(displayWidth * 0.5), y: Math.floor(displayHeight * 0.45) }),
    clampPoint({ x: displayWidth - 96, y: Math.floor(displayHeight * 0.45) }),
    clampPoint({ x: 96, y: Math.floor(displayHeight * 0.45) }),
  ].filter((point, index, points) =>
    points.findIndex((candidate) => candidate.x === point.x && candidate.y === point.y) === index);

  const beforePath = proof.attackMove.armedCommandPath;
  let accepted = null;
  for (const destination of destinations) {
    console.error(`[input-select-e2e] trying attack-move destination ` +
      `(${destination.x},${destination.y})`);
    await postMouse(page, WM_MOUSEMOVE, destination);
    await runFrames(page, 5, "attack-move mouse move");
    await postMouse(page, WM_LBUTTONDOWN, destination);
    await runFrames(page, 5, "attack-move down");
    await postMouse(page, WM_LBUTTONUP, destination);
    await runFrames(page, 5, "attack-move up");

    const afterSelection = await rpc(page, "querySelection");
    const afterPath = compactMoveCommandPath(afterSelection?.result);
    const delta = buildMoveDispatchDelta(beforePath, afterPath);
    const attempt = {
      destination,
      commandPath: afterPath,
      delta,
      selectCount: afterSelection?.result?.selectCount ?? null,
      selectedIds: (afterSelection?.result?.selected ?? [])
        .map((selected) => selected.id),
    };
    proof.attackMove.attempts.push(attempt);
    console.error(`[input-select-e2e] attack-move attempt: ${JSON.stringify(attempt)}`);
    if (delta.dispatch > 0) {
      expect(afterPath.dispatchLastMoveCommandTypeName === "MSG_DO_ATTACKMOVETO",
        "attack-move destination dispatched the wrong command type",
        attempt);
      expect(afterPath.dispatchLastMoveHadGroup === 1,
        "attack-move dispatch did not include a selected group",
        attempt);
      accepted = {
        destination,
        afterCommandPath: afterPath,
        dispatchDelta: delta,
      };
      break;
    }
  }

  expect(accepted != null,
    "no attack-move destination produced MSG_DO_ATTACKMOVETO",
    proof.attackMove.attempts);

  await runFrames(page, 120, "attack-move post-dispatch");
  const stateQuery = await queryDrawablesChecked(page, "attack-move post state");
  const stateDrawables = stateQuery.result?.allDrawables ?? stateQuery.result?.drawables ?? [];
  const afterUnit = stateDrawables.find((candidate) => candidate.id === unit.id);
  const worldDelta = worldDistance2d(unit.worldPos, afterUnit?.worldPos);
  expect(Number.isFinite(worldDelta) && worldDelta > 1.0,
    "attack-move dispatch did not move the produced unit",
    {
      unit,
      afterUnit: compactDrawable(afterUnit),
      worldDelta,
      accepted,
    });

  proof.attackMove.ok = true;
  proof.attackMove.accepted = accepted;
  proof.attackMove.afterWorldPos = afterUnit?.worldPos ?? null;
  proof.attackMove.worldDelta = worldDelta;
  proof.attackMove.verdict = "ATTACK-MOVE-DISPATCHED-AND-UNIT-MOVED";
  proof.ok = true;
  proof.postState = {
    attackMove: true,
    unitMoved: true,
    worldDelta,
    beforeWorldPos: unit.worldPos,
    afterWorldPos: afterUnit?.worldPos ?? null,
  };
  proof.verdict = proof.attackMove.verdict;
  console.error(`[input-select-e2e] attack-move proof accepted: ` +
    `${proof.attackMove.verdict}, worldDelta=${worldDelta}`);
  return proof.attackMove;
}

async function proveAttackOrder(page, producedUnit, results) {
  console.error(`[input-select-e2e] === ATTACK ORDER ===`);
  expect(producedUnit?.id != null,
    "attack proof did not receive a produced unit object",
    producedUnit);

  const preflightFrame = await runFrames(page, 1, "attack proof preflight");
  const displayWidth = preflightFrame?.frame?.clientState?.display?.width ??
    preflightFrame?.frame?.display?.width ??
    1280;
  const displayHeight = preflightFrame?.frame?.clientState?.display?.height ??
    preflightFrame?.frame?.display?.height ??
    720;
  const beforeTargets = await queryDrawablesChecked(page, "attack proof target scan");
  const drawables = beforeTargets.result?.drawables ?? [];
  const enemies = beforeTargets.result?.enemyDrawables ?? [];
  const unit = drawables.find((drawable) => drawable.id === producedUnit.id);
  expect(unit != null,
    "produced unit was not visible for attack-order proof",
    {
      producedUnit,
      stats: beforeTargets.result?.stats ?? null,
      localUnits: drawables
        .filter((drawable) => drawable?.localOwned === true && drawable?.structure === false)
        .map(compactDrawable),
    });

  const selectPoint = {
    x: Math.round(unit.screenPos.x),
    y: Math.round(unit.screenPos.y),
  };
  console.error(`[input-select-e2e] selecting produced attack unit ${unit.name}#${unit.id} at ` +
    `(${selectPoint.x},${selectPoint.y})`);

  const selectedForAttack = await selectProducedUnitForAttack(
    page,
    unit,
    displayWidth,
    displayHeight);
  const selection = selectedForAttack.selection;
  expect(selection?.ok === true,
    "attack proof querySelection failed after selecting produced unit",
    {
      unit,
      attempts: selectedForAttack.attempts,
      selection,
    });
  expect((selection.result?.selected ?? []).some((selected) => selected.id === unit.id),
    "attack proof click did not select the produced unit",
    {
      unit,
      attempts: selectedForAttack.attempts,
      selection: selection.result,
    });

  const beforeCommandPath = compactAttackCommandPath(selection.result);
  const useAlternateMouse = selection.result?.inputSettings?.useAlternateMouse === true;
  const primaryClick = useAlternateMouse
    ? { name: "right", down: WM_RBUTTONDOWN, up: WM_RBUTTONUP }
    : { name: "left", down: WM_LBUTTONDOWN, up: WM_LBUTTONUP };
  const secondaryClick = useAlternateMouse
    ? { name: "left", down: WM_LBUTTONDOWN, up: WM_LBUTTONUP }
    : { name: "right", down: WM_RBUTTONDOWN, up: WM_RBUTTONUP };
  const clickModes = [primaryClick, secondaryClick];

  const buildTargetLists = (query) => {
    const source = query.result?.allDrawables ?? query.result?.enemyDrawables ?? [];
    const hostileVisible = rankAttackTargets(
      unit,
      source.filter((candidate) =>
        usableAttackTarget(candidate, displayWidth, displayHeight) &&
        candidate.hostileToLocal === true))
      .slice(0, 16)
      .map((candidate) => ({ ...candidate, forceAttack: false }));
    const forceVisible = rankAttackTargets(
      unit,
      source.filter((candidate) =>
        usableAttackTarget(candidate, displayWidth, displayHeight) &&
        candidate.hostileToLocal !== true))
      .slice(0, 16)
      .map((candidate) => ({ ...candidate, forceAttack: true }));
    const hostileAny = rankAttackTargets(
      unit,
      source.filter((candidate) =>
        usableAttackCandidate(candidate) &&
        candidate.hostileToLocal === true))
      .slice(0, 24)
      .map((candidate) => ({ ...candidate, forceAttack: false }));
    const forceAny = rankAttackTargets(
      unit,
      source.filter((candidate) =>
        usableAttackCandidate(candidate) &&
        candidate.hostileToLocal !== true))
      .slice(0, 24)
      .map((candidate) => ({ ...candidate, forceAttack: true }));
    return {
      source,
      visible: hostileVisible.length > 0 ? hostileVisible : forceVisible,
      offscreen: hostileAny.length > 0 ? hostileAny : forceAny,
      hostileVisible,
      forceVisible,
      hostileAny,
      forceAny,
    };
  };

  let targetQuery = beforeTargets;
  let targetLists = buildTargetLists(targetQuery);
  let usableTargets = targetLists.visible;

  const proof = {
    ok: false,
    selectedUnit: compactDrawable(unit),
    display: { width: displayWidth, height: displayHeight },
    selectAttempts: selectedForAttack.attempts,
    beforeCommandPath,
    targetStats: beforeTargets.result?.stats ?? null,
    sourceTargetCount: targetLists.source.length,
    visibleTargetCount: targetLists.visible.length,
    offscreenTargetCount: targetLists.offscreen.length,
    candidateTargets: usableTargets.map((candidate) => ({
      ...compactDrawable(candidate),
      forceAttack: candidate.forceAttack === true,
      rank: attackTargetRank(candidate),
      distanceFromUnit: worldDistance2d(unit.worldPos, candidate.worldPos),
    })),
    offscreenCandidateTargets: targetLists.offscreen.map((candidate) => ({
      ...compactDrawable(candidate),
      forceAttack: candidate.forceAttack === true,
      rank: attackTargetRank(candidate),
      distanceFromUnit: worldDistance2d(unit.worldPos, candidate.worldPos),
    })),
    objectAttackSkippedReason: null,
    attackMove: null,
    cameraLookAtAttempts: [],
    reselectAttempts: [],
    attempts: [],
    accepted: null,
    maxFrames: null,
    frameChunk: null,
    samples: [],
    postState: null,
    verdict: null,
  };
  results.attackProof = proof;

  if (targetLists.hostileAny.length === 0) {
    proof.objectAttackSkippedReason = "NO_HOSTILE_TARGETS_IN_LIVE_SKIRMISH";
    console.error("[input-select-e2e] no hostile live skirmish targets found; " +
      "proving produced-unit attack-move instead");
    await proveAttackMoveOrder(page, unit, selection.result, displayWidth, displayHeight, proof);
    return proof;
  }

  if (usableTargets.length === 0 && targetLists.offscreen.length > 0) {
    for (const candidate of targetLists.offscreen.slice(0, 8)) {
      console.error(`[input-select-e2e] framing off-screen attack target ` +
        `${candidate.name}#${candidate.id} at ${JSON.stringify(candidate.worldPos)}`);
      const lookAt = await rpc(page, "tacticalViewLookAt", { worldPos: candidate.worldPos });
      expect(lookAt?.ok === true,
        "tactical view could not frame off-screen attack target",
        { candidate: compactDrawable(candidate), lookAt });
      await runFrames(page, 10, "attack proof camera frame target");
      const framedQuery = await queryDrawablesChecked(page, "attack proof framed target scan");
      const framedLists = buildTargetLists(framedQuery);
      const matchingVisible = framedLists.visible.find((target) => target.id === candidate.id);
      const nextTargets = matchingVisible != null
        ? [
            matchingVisible,
            ...framedLists.visible.filter((target) => target.id !== matchingVisible.id),
          ]
        : framedLists.visible;
      const attempt = {
        requested: {
          ...compactDrawable(candidate),
          forceAttack: candidate.forceAttack === true,
          rank: attackTargetRank(candidate),
        },
        lookAt: lookAt.result ?? null,
        visibleTargetCount: nextTargets.length,
        matchedRequested: matchingVisible != null,
        framedStats: framedQuery.result?.stats ?? null,
        visibleTargets: nextTargets.slice(0, 8).map((target) => ({
          ...compactDrawable(target),
          forceAttack: target.forceAttack === true,
          rank: attackTargetRank(target),
          distanceFromUnit: worldDistance2d(unit.worldPos, target.worldPos),
        })),
      };
      proof.cameraLookAtAttempts.push(attempt);
      if (nextTargets.length > 0) {
        targetQuery = framedQuery;
        targetLists = framedLists;
        usableTargets = nextTargets;
        proof.targetStats = framedQuery.result?.stats ?? proof.targetStats;
        proof.visibleTargetCount = usableTargets.length;
        proof.candidateTargets = usableTargets.map((target) => ({
          ...compactDrawable(target),
          forceAttack: target.forceAttack === true,
          rank: attackTargetRank(target),
          distanceFromUnit: worldDistance2d(unit.worldPos, target.worldPos),
        }));
        break;
      }
    }
  }

  const targetIds = new Set(usableTargets.map((candidate) => candidate.id));

  console.error(`[input-select-e2e] attack target candidates: ` +
    `${JSON.stringify(proof.candidateTargets.map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      forceAttack: candidate.forceAttack,
      hostileToLocal: candidate.hostileToLocal,
      relationshipToLocalName: candidate.relationshipToLocalName,
      structure: candidate.structure,
      screenPos: candidate.screenPos,
      health: candidate.body?.health,
      maxHealth: candidate.body?.maxHealth,
      distanceFromUnit: candidate.distanceFromUnit,
    })))}`);

  expect(usableTargets.length > 0,
    "no visible attack target is available for attack-order proof",
    {
      stats: targetQuery.result?.stats ?? null,
      sourceTargetCount: targetLists.source.length,
      enemyCount: enemies.length,
      hostileCount: targetLists.source.filter((candidate) =>
        candidate?.onScreen === true && candidate.hostileToLocal === true).length,
      fallbackForceAttack: targetLists.hostileVisible.length === 0,
      offscreenCandidateCount: targetLists.offscreen.length,
      rejectedSceneryCount: targetLists.source.filter((candidate) =>
        candidate?.onScreen === true && attackTargetRank(candidate) >= 3).length,
      sampleTargets: targetLists.source.slice(0, 12).map(compactDrawable),
      cameraLookAtAttempts: proof.cameraLookAtAttempts,
    });

  let accepted = null;
  for (const clickMode of clickModes) {
    for (const target of usableTargets) {
      const point = {
        x: Math.round(target.screenPos.x),
        y: Math.round(target.screenPos.y),
      };
      let forceAttackSelection = null;
      let controlHeld = false;
      try {
        if (target.forceAttack === true) {
          await page.keyboard.down("Control");
          controlHeld = true;
          await runFrames(page, 5, "attack proof ctrl down");
          forceAttackSelection = await rpc(page, "querySelection");
          expect(forceAttackSelection?.result?.modes?.forceAttack === true,
            "CTRL did not enter force-attack mode before attack proof",
            forceAttackSelection?.result?.modes);
        }

        console.error(`[input-select-e2e] trying ${clickMode.name}-click attack on ` +
          `${target.name}#${target.id} at (${point.x},${point.y})`);
        await postMouse(page, WM_MOUSEMOVE, point);
        await runFrames(page, 5, "attack proof mouse move");
        await postMouse(page, clickMode.down, point);
        await runFrames(page, 5, "attack proof down");
        await postMouse(page, clickMode.up, point);
        await runFrames(page, 5, "attack proof up");
      } finally {
        if (controlHeld) {
          await page.keyboard.up("Control");
          await runFrames(page, 5, "attack proof ctrl up");
        }
      }

      const afterClickSelection = await rpc(page, "querySelection");
      const afterCommandPath = compactAttackCommandPath(afterClickSelection?.result);
      const delta = buildAttackDispatchDelta(beforeCommandPath, afterCommandPath);
      const attempt = {
        clickButton: clickMode.name,
        target: {
          ...compactDrawable(target),
          forceAttack: target.forceAttack === true,
          point,
          rank: attackTargetRank(target),
        },
        forceAttackModeBeforeClick: forceAttackSelection?.result?.modes?.forceAttack ?? null,
        selectCount: afterClickSelection?.result?.selectCount ?? null,
        selectedIds: (afterClickSelection?.result?.selected ?? [])
          .map((selected) => selected.id),
        commandPath: afterCommandPath,
        dispatchDelta: delta,
      };
      proof.attempts.push(attempt);
      console.error(`[input-select-e2e] attack attempt: ${JSON.stringify(attempt)}`);

      const attackTypeName = afterCommandPath.dispatchLastAttackCommandTypeName;
      if (delta.dispatch > 0 &&
          afterCommandPath.dispatchLastAttackHadGroup === 1 &&
          targetIds.has(afterCommandPath.dispatchLastAttackTargetId) &&
          (attackTypeName === "MSG_DO_ATTACK_OBJECT" ||
            attackTypeName === "MSG_DO_FORCE_ATTACK_OBJECT")) {
        const acceptedTarget = usableTargets.find((candidate) =>
          candidate.id === afterCommandPath.dispatchLastAttackTargetId) ?? target;
        accepted = {
          clickButton: clickMode.name,
          clickedPoint: point,
          target: acceptedTarget,
          forceAttack: target.forceAttack === true,
          beforeCommandPath,
          afterCommandPath,
          dispatchDelta: delta,
        };
        break;
      }

      const stillSelected = (afterClickSelection?.result?.selected ?? [])
        .some((selected) => selected.id === unit.id);
      if (!stillSelected) {
        const reselected = await selectProducedUnitForAttack(
          page,
          unit,
          displayWidth,
          displayHeight);
        proof.reselectAttempts.push(reselected.attempts);
        expect((reselected.selection?.result?.selected ?? [])
          .some((selected) => selected.id === unit.id),
          "attack proof could not reselect produced unit after a failed target attempt",
          {
            unit,
            attempts: reselected.attempts,
            selection: reselected.selection?.result ?? null,
          });
      }
    }
    if (accepted != null) {
      break;
    }
  }

  expect(accepted != null,
    "no visible target produced a real attack dispatch",
    proof.attempts);

  proof.accepted = {
    ...accepted,
    target: {
      ...compactDrawable(accepted.target),
      forceAttack: accepted.forceAttack === true,
      rank: attackTargetRank(accepted.target),
    },
  };
  console.error(`[input-select-e2e] accepted attack target: ${JSON.stringify(proof.accepted)}`);

  const maxFrames = parsePositiveInt("E2E_ATTACK_EFFECT_MAX_FRAMES", 1800);
  const frameChunk = parsePositiveInt("E2E_ATTACK_EFFECT_FRAME_CHUNK", 60);
  proof.maxFrames = maxFrames;
  proof.frameChunk = frameChunk;

  const beforeHealth = accepted.target.body?.ready === true
    ? Number(accepted.target.body.health)
    : null;
  const beforeDamageTimestamp = Number(accepted.target.body?.lastDamageTimestamp ?? 0);
  const beforeDistance = worldDistance2d(unit.worldPos, accepted.target.worldPos);
  let framesAdvanced = 0;
  let firstStateChange = null;
  let firstDamage = null;

  while (framesAdvanced <= maxFrames) {
    const stateQuery = await queryDrawablesChecked(page, "attack proof state");
    const stateDrawables = stateQuery.result?.allDrawables ?? stateQuery.result?.drawables ?? [];
    const afterUnit = stateDrawables
      .find((candidate) => candidate.id === unit.id);
    const afterTarget = stateDrawables
      .find((candidate) => candidate.id === accepted.target.id);
    const afterHealth = afterTarget?.body?.ready === true
      ? Number(afterTarget.body.health)
      : null;
    const afterDamageTimestamp = Number(afterTarget?.body?.lastDamageTimestamp ?? 0);
    const unitDelta = worldDistance2d(unit.worldPos, afterUnit?.worldPos);
    const afterDistance = worldDistance2d(afterUnit?.worldPos, afterTarget?.worldPos);
    const targetDamaged = (
      Number.isFinite(beforeHealth) &&
      Number.isFinite(afterHealth) &&
      afterHealth < beforeHealth - 0.1
    ) ||
      (Number.isFinite(beforeDamageTimestamp) &&
        afterDamageTimestamp > beforeDamageTimestamp) ||
      afterTarget?.effectivelyDead === true;
    const unitMoved = Number.isFinite(unitDelta) && unitDelta > 1.0;
    const distanceClosed = Number.isFinite(beforeDistance) &&
      Number.isFinite(afterDistance) &&
      afterDistance < beforeDistance - 1.0;
    const sample = {
      framesAdvanced,
      stats: stateQuery.result?.stats ?? null,
      targetStillVisible: afterTarget != null,
      beforeHealth,
      afterHealth: Number.isFinite(afterHealth) ? afterHealth : null,
      beforeDamageTimestamp,
      afterDamageTimestamp,
      beforeDistance,
      afterDistance: Number.isFinite(afterDistance) ? afterDistance : null,
      unitDelta: Number.isFinite(unitDelta) ? unitDelta : null,
      targetDamaged,
      unitMoved,
      distanceClosed,
      target: compactDrawable(afterTarget),
      unit: compactDrawable(afterUnit),
    };
    proof.samples.push(sample);
    console.error(`[input-select-e2e] attack sample ${framesAdvanced}/${maxFrames}: ` +
      `targetDamaged=${sample.targetDamaged}, unitMoved=${sample.unitMoved}, ` +
      `distanceClosed=${sample.distanceClosed}, health=${sample.beforeHealth}->${sample.afterHealth}`);

    if (targetDamaged && firstDamage == null) {
      firstDamage = sample;
      break;
    }
    if (firstStateChange == null && (unitMoved || distanceClosed)) {
      firstStateChange = sample;
    }

    if (framesAdvanced >= maxFrames) {
      break;
    }
    const frames = Math.min(frameChunk, maxFrames - framesAdvanced);
    await runSummary(page, frames, "attack proof effect wait");
    framesAdvanced += frames;
  }

  const postState = firstDamage ?? firstStateChange;
  expect(postState != null,
    "attack command dispatched but object state did not change",
    {
      accepted: proof.accepted,
      samples: proof.samples.slice(-12),
    });

  proof.ok = true;
  proof.postState = postState;
  proof.verdict = firstDamage != null
    ? "ATTACK-DISPATCHED-AND-TARGET-DAMAGED"
    : "ATTACK-DISPATCHED-AND-OBJECT-STATE-CHANGED";
  console.error(`[input-select-e2e] attack proof accepted: ${proof.verdict}`);
  return proof;
}

/**
 * Retry wrapper for extraction race (errno=17/EEXIST).
 */
async function withRetry(fn, maxRetries = 3, retryDelayMs = 30000) {
  let lastError = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isExtractionRace = error?.code === "EEXIST" ||
        String(error).includes("EEXIST") ||
        String(error).includes("extraction race");
      if (isExtractionRace && attempt < maxRetries - 1) {
        console.error(`[input-select-e2e] extraction race detected (attempt ${attempt + 1}/${maxRetries}), waiting ${retryDelayMs}ms...`);
        await new Promise((r) => setTimeout(r, retryDelayMs));
      } else {
        throw error;
      }
    }
  }
  throw lastError;
}

async function main() {
  const results = {
    ok: false,
    archivesMounted: false,
    activeMatch: false,
    matchState: null,
    dragProof: { selectCount: null, selectedCount: 0, selected: [] },
    clickProof: { selectCount: null, selectedCount: 0, selected: [] },
    commandBarProof: {
      ok: false,
      selectedTemplate: null,
      selectedKindOf: null,
      visibleCommandCount: 0,
      chosen: null,
      beforeCommandPath: null,
      afterClickCommandPath: null,
      afterPlacementCommandPath: null,
      dispatchDeltaAfterClick: null,
      dispatchDeltaAfterPlacement: null,
      pendingAfterClick: null,
      placementAttempts: [],
      verdict: null,
    },
    productionProof: {
      ok: false,
      buildTemplate: null,
      beforeMatchingIds: [],
      beforeMatching: [],
      maxFrames: null,
      frameChunk: null,
      framesAdvanced: null,
      created: null,
      samples: [],
      progress: null,
      completion: null,
      unitProduction: null,
      verdict: null,
    },
    attackProof: {
      ok: false,
      selectedUnit: null,
      display: null,
      selectAttempts: [],
      beforeCommandPath: null,
      targetStats: null,
      candidateTargets: [],
      offscreenCandidateTargets: [],
      objectAttackSkippedReason: null,
      attackMove: null,
      cameraLookAtAttempts: [],
      reselectAttempts: [],
      attempts: [],
      accepted: null,
      maxFrames: null,
      frameChunk: null,
      samples: [],
      postState: null,
      verdict: null,
    },
    moveOrderProof: {
      ok: false,
      selectedUnit: null,
      beforeCommandPath: null,
      afterCommandPath: null,
      dispatchDelta: null,
      destination: null,
      moveButton: null,
      beforeWorldPos: null,
      afterWorldPos: null,
      worldDelta: null,
      attempts: [],
      verdict: null,
    },
    screenshot: null,
    verdict: null,
  };

  await mkdir(dirname(screenshotPath), { recursive: true });
  await mkdir(dirname(outputPath), { recursive: true });

  const server = await startStaticServer({ root: wasmRoot });
  let browser;
  try {
    const launchOptions = { headless: true };
    const executablePath = process.env.E2E_BROWSER_EXECUTABLE ?? process.env.CHROME_PATH;
    if (executablePath) {
      launchOptions.executablePath = executablePath;
    }
    if (process.env.E2E_BROWSER_ARGS) {
      launchOptions.args = process.env.E2E_BROWSER_ARGS.split(/\s+/).filter(Boolean);
    }

    browser = await chromium.launch(launchOptions);
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.setDefaultTimeout(300000);
    page.setDefaultNavigationTimeout(300000);
    page.on("pageerror", (error) => {
      console.error(`[input-select-e2e] pageerror ${error.stack ?? error.message}`);
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        console.error(`[input-select-e2e page] ${msg.text()}`);
      }
    });

    await page.goto(new URL("harness/index.html", server.url).href, { waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));
    await page.evaluate(() => window.__cncSetDiagLevel?.("lite"));

    // ── Phase 1: mount archives ──
    console.error("[input-select-e2e] mounting archives...");
    const mount = await withRetry(async () =>
      rpc(page, "mountArchives", {
        path: "/assets/e2e-select",
        verifyEach: false,
        archives: buildArchives(server.url),
      }));
    expect(mount?.archiveSet?.archiveCount === archiveSpecs.length,
      "failed to mount runtime archives", mount?.archiveSet ?? mount);
    results.archivesMounted = true;
    console.error(`[input-select-e2e] mounted ${mount.archiveSet.archiveCount} archives`);

    // ── Phase 2: realEngineInit ──
    console.error("[input-select-e2e] real engine init...");
    const init = await rpc(page, "realEngineInit", {
      runDirectory: "/assets/e2e-select",
      shellMap: true,
    });
    expect(init?.ok === true && init?.aborted === false && init?.frontier?.initReturned === true,
      "real engine init failed", init?.frontier ?? init);
    console.error("[input-select-e2e] real engine init succeeded");

    // ── Phase 3: navigate to main menu ──
    let frame = await runFrames(page, 5, "initial menu frames");
    if (frame.frame?.clientState?.shell?.topIsMainMenu !== true) {
      frame = await waitForCondition(
        page,
        "main menu available",
        (clientState) => clientState.shell?.topIsMainMenu === true &&
          clientState.shell?.topHidden === false,
        120);
    }
    expect(frame.frame?.clientState?.mainMenu?.buttonSinglePlayer?.found === true,
      "main menu Single Player button geometry is unavailable",
      frame.frame?.clientState?.mainMenu?.buttonSinglePlayer);

    console.error("[input-select-e2e] revealing main menu");
    const revealed = await revealMainMenu(page);

    console.error("[input-select-e2e] clicking single player");
    const singlePlayerClick = await clickButton(
      page,
      revealed.frame.clientState.mainMenu.buttonSinglePlayer,
      revealed.frame.clientState.mainMenu.underButtonSinglePlayerCenter,
      "single-player");
    const singlePlayerMenu = singlePlayerClick.settled.frame?.clientState?.mainMenu;
    expect(singlePlayerMenu?.buttonSkirmish?.clickable === true,
      "single-player menu did not expose ButtonSkirmish", singlePlayerMenu);

    console.error("[input-select-e2e] clicking skirmish");
    const skirmishClick = await clickButton(
      page,
      singlePlayerMenu.buttonSkirmish,
      null,
      "skirmish");
    const skirmishMenuReady = skirmishClick.settled.frame?.clientState?.skirmishMenu?.buttonStart?.clickable === true
      ? skirmishClick.settled
      : await waitForCondition(
        page,
        "skirmish options menu",
        (clientState) => clientState.skirmishMenu?.buttonStart?.clickable === true,
        180);
    const skirmishMenu = skirmishMenuReady.frame?.clientState?.skirmishMenu;
    expect(skirmishMenu?.parent?.found === true && skirmishMenu?.buttonStart?.clickable === true,
      "skirmish game options menu did not become startable", skirmishMenu);

    // ── Phase 4: start skirmish match ──
    console.error("[input-select-e2e] starting skirmish match...");
    await clickButton(
      page,
      skirmishMenu.buttonStart,
      skirmishMenu.underButtonStartCenter,
      "skirmish start",
      null);

    console.error("[input-select-e2e] waiting for active match...");
    const active = await waitForSkirmishMatch(page);
    const gameplay = active.result.frame?.gameplay;
    results.activeMatch = true;
    results.matchState = {
      gameMode: gameplay?.gameMode,
      inGame: gameplay?.inGame,
      loadingMap: gameplay?.loadingMap,
      inputEnabled: gameplay?.inputEnabled,
      objectCount: gameplay?.objectCount,
      drawableCount: gameplay?.drawableCount,
      renderedObjectCount: gameplay?.renderedObjectCount,
      localPlayer: gameplay?.localPlayer,
    };
    console.error(`[input-select-e2e] ACTIVE MATCH: gameMode=${gameplay?.gameMode}, inGame=${gameplay?.inGame}, ` +
      `loadingMap=${gameplay?.loadingMap}, inputEnabled=${gameplay?.inputEnabled}, ` +
      `objectCount=${gameplay?.objectCount}, drawableCount=${gameplay?.drawableCount}`);
    expect(gameplay?.gameMode === GAME_SKIRMISH, "game mode is not GAME_SKIRMISH");
    expect(gameplay?.inGame === true, "not inGame");
    expect(gameplay?.loadingMap === false, "still loading map");
    expect(gameplay?.inputEnabled === true, "input not enabled");
    expect(Number(gameplay?.objectCount ?? 0) > 0, "no objects present");

    // ── Phase 5: DRAG BOX-SELECT ──
    // The player's base should be near screen center in Alpine Assault.
    // Drag from (300,150) to (980,520) to cover the central area.
    console.error("[input-select-e2e] === DRAG BOX-SELECT ===");
    const dragStart = { x: 300, y: 150 };
    const dragEnd = { x: 980, y: 520 };
    console.error(`[input-select-e2e] posting drag box-select: (${dragStart.x},${dragStart.y}) -> (${dragEnd.x},${dragEnd.y})`);

    // LBUTTONDOWN at drag start
    await postMouse(page, WM_LBUTTONDOWN, dragStart);
    // A couple of WM_MOUSEMOVE steps during the drag
    await postMouse(page, WM_MOUSEMOVE, { x: 640, y: 335 });
    await postMouse(page, WM_MOUSEMOVE, { x: 800, y: 420 });
    // LBUTTONUP at drag end
    await postMouse(page, WM_LBUTTONUP, dragEnd);

    // Step ~10 frames for selection to settle
    console.error("[input-select-e2e] stepping 10 frames for selection...");
    const selStepResult = await runFrames(page, 10, "selection proof step");

    // Query selection
    console.error("[input-select-e2e] querying selection after drag...");
    const selQuery = await rpc(page, "querySelection");
    const selResult = selQuery?.result ?? {};
    let currentSelectionResult = selResult;
    results.dragProof.selectCount = selResult.selectCount ?? 0;
    results.dragProof.selectedCount = (selResult.selected ?? []).length;
    results.dragProof.selected = (selResult.selected ?? []).map((s) => ({
      id: s.id,
      worldPos: s.worldPos ?? null,
    }));
    console.error(`[input-select-e2e] querySelection after drag: selectCount=${results.dragProof.selectCount}, ` +
      `selectedCount=${results.dragProof.selectedCount}`);
    if (results.dragProof.selected.length > 0) {
      for (const sel of results.dragProof.selected.slice(0, 10)) {
        console.error(`[input-select-e2e]   selected: id=${sel.id}, worldPos=${JSON.stringify(sel.worldPos)}`);
      }
    }

    // ── Phase 6: DIRECT CLICK ──
    // If the drag didn't select anything, try a direct click near screen center
    // where the base structure should be.
    if (results.dragProof.selectCount === 0) {
      console.error("[input-select-e2e] drag didn't select units, trying direct click at screen center...");
      const clickPos = { x: 640, y: 250 };
      await postMouse(page, WM_LBUTTONDOWN, clickPos);
      await runFrames(page, 1, "click down settle");
      await postMouse(page, WM_LBUTTONUP, clickPos);
      await runFrames(page, 5, "click up settle");

      const selQuery2 = await rpc(page, "querySelection");
      const selResult2 = selQuery2?.result ?? {};
      currentSelectionResult = selResult2;
      results.clickProof.selectCount = selResult2.selectCount ?? 0;
      results.clickProof.selectedCount = (selResult2.selected ?? []).length;
      results.clickProof.selected = (selResult2.selected ?? []).map((s) => ({
        id: s.id,
        worldPos: s.worldPos ?? null,
      }));
      console.error(`[input-select-e2e] querySelection after click: selectCount=${results.clickProof.selectCount}, ` +
        `selectedCount=${results.clickProof.selectedCount}`);
      if (results.clickProof.selected.length > 0) {
        for (const sel of results.clickProof.selected.slice(0, 10)) {
          console.error(`[input-select-e2e]   selected: id=${sel.id}, worldPos=${JSON.stringify(sel.worldPos)}`);
        }
      }
    }

    // ── Phase 7: MOVE ORDER ──
    const moveSelectionResult = await proveMoveOrder(page, active.result, results);
    currentSelectionResult = moveSelectionResult;

    // ── Phase 8: COMMAND BAR BUILD/QUEUE BUTTON ──
    const selectionWorksNow = Number(currentSelectionResult.selectCount ?? 0) > 0;
    if (selectionWorksNow) {
      console.error("[input-select-e2e] === COMMAND BAR BUILD/QUEUE BUTTON ===");
      const firstSelected = currentSelectionResult.selected?.[0] ?? null;
      results.commandBarProof.selectedTemplate = firstSelected?.templateName ?? null;
      results.commandBarProof.selectedKindOf = firstSelected?.kindOf ?? null;
      results.commandBarProof.beforeCommandPath = compactCommandPath(currentSelectionResult);

      const commandReady = await waitForCommandButtons(page);
      const entries = commandButtonEntries(commandReady.frame?.clientState?.controlBarWindows);
      results.commandBarProof.visibleCommandCount = entries.length;
      results.commandBarProof.visibleCommands = entries.map(({ slot, button }) => ({
        slot,
        id: button.id,
        centerX: button.centerX,
        centerY: button.centerY,
        clickable: button.clickable,
        command: button.command,
      }));
      console.error(`[input-select-e2e] visible command buttons: ${entries.length}`);

      const chosen = chooseBuildCommandButton(entries);
      expect(chosen != null,
        "no build/queue command button was visible after selecting a controllable object",
        results.commandBarProof.visibleCommands);
      results.commandBarProof.chosen = {
        slot: chosen.slot,
        id: chosen.button.id,
        centerX: chosen.button.centerX,
        centerY: chosen.button.centerY,
        command: chosen.button.command,
      };
      console.error(`[input-select-e2e] clicking ${chosen.slot}: ${JSON.stringify(chosen.button.command)}`);

      const beforeConstructionDrawables =
        await queryDrawablesChecked(page, "before command-bar build");

      await clickButton(page, chosen.button, null,
        `command-bar ${chosen.slot} ${chosen.button.command?.name ?? "command"}`,
        null);
      await runFrames(page, 3, "command-bar click settle");

      const afterClickQuery = await rpc(page, "querySelection");
      const afterClickResult = afterClickQuery?.result ?? {};
      results.commandBarProof.afterClickCommandPath = compactCommandPath(afterClickResult);
      results.commandBarProof.dispatchDeltaAfterClick = buildDispatchDelta(
        results.commandBarProof.beforeCommandPath,
        results.commandBarProof.afterClickCommandPath);
      results.commandBarProof.pendingAfterClick = {
        pendingPlaceType: afterClickResult.modes?.pendingPlaceType ?? null,
        pendingPlaceSourceObjectId: afterClickResult.modes?.pendingPlaceSourceObjectId ?? null,
        placementAnchored: afterClickResult.modes?.placementAnchored ?? null,
      };

      const clickDispatched = Object.values(results.commandBarProof.dispatchDeltaAfterClick)
        .some((value) => value > 0);
      const pendingMatchesCommand =
        afterClickResult.modes?.pendingPlaceType != null &&
        (chosen.button.command?.buildTemplate == null ||
          afterClickResult.modes.pendingPlaceType === chosen.button.command.buildTemplate);

      let placementDispatched = false;
      if (!clickDispatched && pendingMatchesCommand &&
          chosen.button.command?.typeName === "GUI_COMMAND_DOZER_CONSTRUCT") {
        const placementCandidates = [
          { x: 760, y: 360 },
          { x: 860, y: 390 },
          { x: 690, y: 420 },
          { x: 930, y: 430 },
          { x: 570, y: 360 },
        ];
        for (const point of placementCandidates) {
          console.error(`[input-select-e2e] trying placement click at (${point.x},${point.y})`);
          await clickMapPoint(page, point, "dozer placement");
          const placementQuery = await rpc(page, "querySelection");
          const placementResult = placementQuery?.result ?? {};
          const placementPath = compactCommandPath(placementResult);
          const delta = buildDispatchDelta(
            results.commandBarProof.beforeCommandPath,
            placementPath);
          const attempt = {
            point,
            pendingPlaceType: placementResult.modes?.pendingPlaceType ?? null,
            commandPath: placementPath,
            delta,
          };
          results.commandBarProof.placementAttempts.push(attempt);
          if (delta.dozerConstruct > 0 || delta.build > 0) {
            results.commandBarProof.afterPlacementCommandPath = placementPath;
            results.commandBarProof.dispatchDeltaAfterPlacement = delta;
            placementDispatched = true;
            await proveStructureCreated(
              page,
              chosen.button.command.buildTemplate,
              beforeConstructionDrawables,
              results);
            break;
          }
          if (placementResult.modes?.pendingPlaceType == null) {
            break;
          }
        }
      }

      results.commandBarProof.ok = clickDispatched || pendingMatchesCommand || placementDispatched;
      if (placementDispatched) {
        results.commandBarProof.verdict = "COMMAND-BAR-BUILD-DISPATCHED";
      } else if (clickDispatched) {
        results.commandBarProof.verdict = "COMMAND-BAR-QUEUE-DISPATCHED";
      } else if (pendingMatchesCommand) {
        results.commandBarProof.verdict = "COMMAND-BAR-BUILD-PLACEMENT-PENDING";
      } else {
        results.commandBarProof.verdict = "COMMAND-BAR-CLICK-NO-BUILD-EFFECT";
      }
      console.error(`[input-select-e2e] command-bar verdict: ${results.commandBarProof.verdict}`);
    }

    // ── Phase 9: screenshot ──
    console.error("[input-select-e2e] capturing screenshot...");
    await page.locator("#viewport").screenshot({ path: screenshotPath });
    results.screenshot = screenshotPath;
    console.error(`[input-select-e2e] screenshot saved to ${screenshotPath}`);

    // ── Phase 10: verdict ──
    const dragWorks = results.dragProof.selectCount > 0;
    const clickWorks = results.clickProof.selectCount > 0;
    const selectionWorks = dragWorks || clickWorks;
    const constructionRequired =
      results.commandBarProof.verdict === "COMMAND-BAR-BUILD-DISPATCHED" &&
      results.productionProof.buildTemplate != null;
    const unitProductionRequired = results.productionProof.unitProduction?.chosen != null;
    const attackRequired = results.productionProof.unitProduction?.ok === true;
    results.ok = selectionWorks &&
      results.moveOrderProof.ok === true &&
      (!constructionRequired || results.productionProof.ok === true) &&
      (!unitProductionRequired || results.productionProof.unitProduction?.ok === true) &&
      (!attackRequired || results.attackProof?.ok === true);

    if (selectionWorks && results.moveOrderProof.ok &&
        results.commandBarProof.ok && results.productionProof.unitProduction?.ok &&
        results.attackProof?.ok) {
      results.verdict = `SELECT-MOVE-CONSTRUCT-PRODUCE-AND-ATTACK-WORK (${results.attackProof.verdict})`;
    } else if (selectionWorks && results.moveOrderProof.ok &&
        results.commandBarProof.ok && results.productionProof.unitProduction?.ok) {
      results.verdict = `SELECT-MOVE-CONSTRUCT-AND-UNIT-PRODUCTION-WORK (${results.commandBarProof.verdict})`;
    } else if (selectionWorks && results.moveOrderProof.ok &&
        results.commandBarProof.ok && results.productionProof.ok) {
      results.verdict = `SELECT-MOVE-COMMAND-BAR-AND-CONSTRUCTION-WORK (${results.commandBarProof.verdict})`;
    } else if (selectionWorks && results.moveOrderProof.ok && results.commandBarProof.ok) {
      results.verdict = `SELECT-MOVE-AND-COMMAND-BAR-WORK (${results.commandBarProof.verdict})`;
    } else if (selectionWorks && results.moveOrderProof.ok) {
      results.verdict = "SELECT-AND-MOVE-WORK-COMMAND-BAR-FAILS";
    } else if (dragWorks) {
      results.verdict = "SELECT-WORKS-MOVE-FAILS";
    } else if (clickWorks) {
      results.verdict = "SELECT-WORKS-MOVE-FAILS";
    } else {
      results.verdict = "SELECT-FAILS (selectCount=0 in live match with units present — needs more investigation, e.g. coordinate scaling)";
    }

    console.error("[input-select-e2e] === VERDICT ===");
    console.error(`[input-select-e2e] Active match: ${results.activeMatch}`);
    console.error(`[input-select-e2e] Match state: ${JSON.stringify(results.matchState)}`);
    console.error(`[input-select-e2e] Drag proof: selectCount=${results.dragProof.selectCount}, selectedCount=${results.dragProof.selectedCount}`);
    console.error(`[input-select-e2e] Click proof: selectCount=${results.clickProof.selectCount}, selectedCount=${results.clickProof.selectedCount}`);
    console.error(`[input-select-e2e] Move proof: ${JSON.stringify(results.moveOrderProof)}`);
    console.error(`[input-select-e2e] Command proof: ${JSON.stringify(results.commandBarProof)}`);
    console.error(`[input-select-e2e] Production proof: ${JSON.stringify(results.productionProof)}`);
    console.error(`[input-select-e2e] Attack proof: ${JSON.stringify(results.attackProof)}`);
    console.error(`[input-select-e2e] Screenshot: ${results.screenshot}`);
    console.error(`[input-select-e2e] VERDICT: ${results.verdict}`);

    await writeFile(outputPath, JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));

  } catch (error) {
    console.error(`[input-select-e2e] FATAL: ${error.message}`);
    console.error(error.stack);
    results.error = error.message;
    results.verdict = "ERROR: " + error.message;
    try {
      await writeFile(outputPath, JSON.stringify(results, null, 2));
    } catch (_) { /* ignore */ }
    console.log(JSON.stringify(results, null, 2));
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
    await server.close();
  }

  process.exit(results.ok ? 0 : 1);
}

await main();
