#!/usr/bin/env node
// Verifies that the W3D module-factory startup frontier is still grounded in
// the original Zero Hour factory and registration source facts.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolDir = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(toolDir, "..");
const repoRoot = resolve(wasmRoot, "..");

const paths = {
  gameEngine: "GeneralsMD/Code/GameEngine/Source/Common/GameEngine.cpp",
  win32GameEngine:
    "GeneralsMD/Code/GameEngineDevice/Include/Win32Device/Common/Win32GameEngine.h",
  moduleFactory:
    "GeneralsMD/Code/GameEngine/Source/Common/Thing/ModuleFactory.cpp",
  w3dModuleFactory:
    "GeneralsMD/Code/GameEngineDevice/Source/W3DDevice/Common/Thing/W3DModuleFactory.cpp",
};

const expectedW3DModules = [
  "W3DDefaultDraw",
  "W3DDebrisDraw",
  "W3DModelDraw",
  "W3DLaserDraw",
  "W3DOverlordTankDraw",
  "W3DOverlordTruckDraw",
  "W3DOverlordAircraftDraw",
  "W3DProjectileStreamDraw",
  "W3DPoliceCarDraw",
  "W3DRopeDraw",
  "W3DScienceModelDraw",
  "W3DSupplyDraw",
  "W3DDependencyModelDraw",
  "W3DTankDraw",
  "W3DTruckDraw",
  "W3DTracerDraw",
  "W3DTankTruckDraw",
  "W3DTreeDraw",
  "W3DPropDraw",
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readRepoText(relativePath) {
  try {
    return readFileSync(resolve(repoRoot, relativePath), "utf8");
  } catch (error) {
    fail(`failed to read ${relativePath}: ${error.message}`);
  }
}

function lineOf(text, pattern, label) {
  const match = pattern.exec(text);
  if (!match) {
    fail(`missing ${label}`);
  }
  return text.slice(0, match.index).split(/\r?\n/).length;
}

function functionBody(text, signaturePattern, label) {
  const match = signaturePattern.exec(text);
  if (!match) {
    fail(`missing ${label}`);
  }

  const bodyStart = text.indexOf("{", match.index);
  if (bodyStart === -1) {
    fail(`missing body for ${label}`);
  }

  let depth = 0;
  for (let index = bodyStart; index < text.length; ++index) {
    if (text[index] === "{") {
      ++depth;
    } else if (text[index] === "}") {
      --depth;
      if (depth === 0) {
        return {
          body: text.slice(bodyStart + 1, index),
          line: text.slice(0, match.index).split(/\r?\n/).length,
        };
      }
    }
  }

  fail(`unterminated body for ${label}`);
}

function expectInBody(body, pattern, label) {
  if (!pattern.test(body)) {
    fail(`missing ${label}`);
  }
}

const gameEngine = readRepoText(paths.gameEngine);
const win32GameEngine = readRepoText(paths.win32GameEngine);
const moduleFactory = readRepoText(paths.moduleFactory);
const w3dModuleFactory = readRepoText(paths.w3dModuleFactory);

const createModuleFactoryLine = lineOf(
  win32GameEngine,
  /createModuleFactory\s*\(\s*void\s*\)\s*\{\s*return\s+NEW\s+W3DModuleFactory\s*;/,
  "Win32GameEngine::createModuleFactory returning W3DModuleFactory",
);

const gameEngineModuleFactoryLine = lineOf(
  gameEngine,
  /initSubsystem\s*\(\s*TheModuleFactory\s*,\s*"TheModuleFactory"\s*,\s*createModuleFactory\s*\(\s*\)/,
  "GameEngine::init TheModuleFactory createModuleFactory call",
);

const w3dInit = functionBody(
  w3dModuleFactory,
  /void\s+W3DModuleFactory::init\s*\(\s*void\s*\)/,
  "W3DModuleFactory::init",
);

expectInBody(
  w3dInit.body,
  /ModuleFactory::init\s*\(\s*\)\s*;/,
  "W3DModuleFactory::init extending ModuleFactory::init",
);

const registeredW3DModules = [...w3dInit.body.matchAll(/addModule\s*\(\s*(W3D\w+)\s*\)/g)]
  .map(match => match[1]);
for (const moduleName of expectedW3DModules) {
  if (!registeredW3DModules.includes(moduleName)) {
    fail(`missing W3D module registration: ${moduleName}`);
  }
}

const baseInit = functionBody(
  moduleFactory,
  /void\s+ModuleFactory::init\s*\(\s*void\s*\)/,
  "ModuleFactory::init",
);
expectInBody(baseInit.body, /addModule\s*\(\s*ActiveBody\s*\)/, "base ActiveBody registration");
expectInBody(baseInit.body, /addModule\s*\(\s*BeaconClientUpdate\s*\)/, "base client-update registration");

const interfaceMask = functionBody(
  moduleFactory,
  /Int\s+ModuleFactory::findModuleInterfaceMask\s*\([^)]*\)/,
  "ModuleFactory::findModuleInterfaceMask",
);
expectInBody(
  interfaceMask.body,
  /findModuleTemplate\s*\(\s*name\s*,\s*type\s*\)/,
  "findModuleInterfaceMask using findModuleTemplate",
);
expectInBody(
  interfaceMask.body,
  /moduleTemplate->m_whichInterfaces/,
  "findModuleInterfaceMask returning registered interface mask",
);

const findTemplate = functionBody(
  moduleFactory,
  /const\s+ModuleFactory::ModuleTemplate\s*\*\s*ModuleFactory::findModuleTemplate\s*\([^)]*\)/,
  "ModuleFactory::findModuleTemplate",
);
expectInBody(findTemplate.body, /makeDecoratedNameKey\s*\(\s*name\s*,\s*type\s*\)/, "decorated name key lookup");
expectInBody(findTemplate.body, /m_moduleTemplateMap\.find\s*\(\s*namekey\s*\)/, "module template map lookup");

const addInternal = functionBody(
  moduleFactory,
  /void\s+ModuleFactory::addModuleInternal\s*\([^)]*\)/,
  "ModuleFactory::addModuleInternal",
);
expectInBody(addInternal.body, /m_moduleTemplateMap\s*\[\s*namekey\s*\]/, "module template map insertion");
expectInBody(addInternal.body, /m_createProc\s*=\s*proc/, "module create proc registration");
expectInBody(addInternal.body, /m_whichInterfaces\s*=\s*whichIntf/, "module interface mask registration");

console.log(JSON.stringify({
  ok: true,
  source: "GeneralsMD original",
  path: "w3d-module-factory-frontier",
  factory: {
    createModuleFactoryLine,
    concrete: "W3DModuleFactory",
  },
  gameEngineCall: {
    line: gameEngineModuleFactoryLine,
    subsystem: "TheModuleFactory",
  },
  registration: {
    initLine: w3dInit.line,
    baseInit: true,
    w3dDrawModules: registeredW3DModules.length,
    requiredModules: expectedW3DModules,
  },
  lookup: {
    interfaceMaskPublicApi: "ModuleFactory::findModuleInterfaceMask",
    decoratedKeyLookup: true,
    mapInsertion: true,
  },
  runtimeCoveredBy:
    "startup-vertical archive-backed moduleFactoryRuntime constructs W3DModuleFactory, runs init(), and proves public ModuleFactory lookups for representative base gameplay, client-update, and W3D draw modules",
}));
