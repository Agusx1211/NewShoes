#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(toolDir, "..", "..");
const sourcePath =
  "GeneralsMD/Code/GameEngine/Source/GameClient/System/ParticleSys.cpp";
const source = readFileSync(resolve(repoRoot, sourcePath), "utf8");
const rendererPath =
  "GeneralsMD/Code/GameEngineDevice/Source/W3DDevice/GameClient/W3DParticleSys.cpp";
const renderer = readFileSync(resolve(repoRoot, rendererPath), "utf8");

function functionBody(signature) {
  const match = signature.exec(source);
  if (!match) {
    throw new Error(`${signature}: definition not found`);
  }

  const openBrace = source.indexOf("{", match.index + match[0].length);
  if (openBrace < 0) {
    throw new Error(`${signature}: body not found`);
  }

  let depth = 0;
  for (let index = openBrace; index < source.length; ++index) {
    if (source[index] === "{") {
      ++depth;
    } else if (source[index] === "}" && --depth === 0) {
      return source.slice(openBrace + 1, index);
    }
  }

  throw new Error(`${signature}: unterminated body`);
}

const errors = [];
try {
  const createBody = functionBody(
    /Particle\s+\*ParticleSystem::createParticle\s*\(/);
  const zeroLimit = /if\s*\(\s*maxParticleCount\s*==\s*0\s*\)/.exec(createBody);
  const fullLimit =
    /if\s*\(\s*particleCount\s*>=\s*maxParticleCount\s*\)/.exec(createBody);
  const roomForNewParticle =
    /particlesToRemove\s*=\s*particleCount\s*-\s*maxParticleCount\s*\+\s*1\s*;/
      .exec(createBody);
  const eviction =
    /removeOldestCulledParticles\s*\(\s*particlesToRemove\s*,\s*priority\s*\)/
      .exec(createBody);
  if (!zeroLimit || !fullLimit || !roomForNewParticle || !eviction) {
    throw new Error(
      "createParticle: particle limit does not reserve one slot through culled-first priority eviction");
  }
  if (!(zeroLimit.index < fullLimit.index
      && fullLimit.index < roomForNewParticle.index
      && roomForNewParticle.index < eviction.index)) {
    throw new Error("createParticle: particle-limit checks are out of order");
  }

  const removalBody = functionBody(
    /Int\s+ParticleSystemManager::removeOldestParticles\s*\(/);
  if (!/UnsignedInt\s+removedCount\s*=\s*0\s*;/.test(removalBody)
      || !/removedCount\s*<\s*count/.test(removalBody)
      || !/i\s*<=\s*priorityCap/.test(removalBody)
      || !/\+\+removedCount\s*;/.test(removalBody)
      || !/if\s*\(\s*!removedParticle\s*\)\s*break\s*;/.test(removalBody)
      || !/return\s*\(\s*Int\s*\)\s*removedCount\s*;/.test(removalBody)) {
    throw new Error(
      "removeOldestParticles: eviction does not refresh the full priority band with exact accounting");
  }
  if (/while\s*\(\s*count--/.test(removalBody)
      || /countToRemove\s*-\s*count/.test(removalBody)) {
    throw new Error(
      "removeOldestParticles: unsigned post-decrement accounting remains");
  }

  const culledRemovalBody = functionBody(
    /Int\s+ParticleSystemManager::removeOldestCulledParticles\s*\(/);
  if (!/m_culledParticleCount\s*>\s*0/.test(culledRemovalBody)
      || !/i\s*<=\s*priorityCap/.test(culledRemovalBody)
      || !/particle->isCulled\(\)/.test(culledRemovalBody)
      || !/return\s*\(\s*Int\s*\)\s*removedCount\s*;/.test(culledRemovalBody)) {
    throw new Error(
      "removeOldestCulledParticles: culled effects are not evicted first with exact accounting");
  }

  const systemLoop = /for\s*\(\s*ParticleSystemManager::ParticleSystemListIt[\s\S]*?\/\/ next system/
    .exec(renderer)?.[0];
  if (!systemLoop) {
    throw new Error("W3DParticleSystemManager: particle-system render loop not found");
  }
  const emptySystemGuard = /if\s*\(\s*sys->getParticleCount\(\)\s*==\s*0\s*\)/
    .exec(systemLoop);
  const bufferSetup = /m_posBuffer->Get_Array\(\)/.exec(systemLoop);
  if (!emptySystemGuard || !bufferSetup
      || emptySystemGuard.index >= bufferSetup.index) {
    throw new Error(
      "W3DParticleSystemManager: empty systems are not skipped before render-buffer setup");
  }
  if ((systemLoop.match(/p->setIsCulled\s*\(\s*culled\s*\)/g) ?? []).length < 2
      || !/setCulledParticleCount\s*\(\s*culledParticleCount\s*\)/.test(renderer)) {
    throw new Error(
      "W3DParticleSystemManager: smudge and point visibility is not reported once per frame");
  }
} catch (error) {
  errors.push(error instanceof Error ? error.message : String(error));
}

if (errors.length > 0) {
  console.error(JSON.stringify({ ok: false, source: sourcePath, errors }));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  sources: [sourcePath, rendererPath],
  invariant: "particle cap evicts culled effects before refreshing the oldest eligible priority; empty render work is skipped",
}));
