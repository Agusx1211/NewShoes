#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(toolDir, "..", "..");
const sourcePath =
  "GeneralsMD/Code/GameEngine/Source/GameLogic/Object/Contain/RiderChangeContain.cpp";
const source = readFileSync(resolve(repoRoot, sourcePath), "utf8");

function extractBlock(text, openBrace, label) {
  let depth = 0;
  for (let index = openBrace; index < text.length; ++index) {
    if (text[index] === "{") {
      ++depth;
    } else if (text[index] === "}" && --depth === 0) {
      return text.slice(openBrace + 1, index);
    }
  }
  throw new Error(`${label}: unterminated block`);
}

function functionBody(name) {
  const signature = new RegExp(`RiderChangeContain::${name}\\s*\\(`);
  const match = signature.exec(source);
  if (!match) {
    throw new Error(`${name}: definition not found`);
  }

  const openBrace = source.indexOf("{", match.index + match[0].length);
  if (openBrace < 0) {
    throw new Error(`${name}: body not found`);
  }
  return extractBlock(source, openBrace, name);
}

const methods = ["isValidContainerFor", "onContaining", "onRemoving"];
const errors = [];

for (const method of methods) {
  try {
    const body = functionBody(method);
    const guardedComparison =
      /const\s+ThingTemplate\s*\*\s*thing\s*=\s*TheThingFactory->findTemplate\s*\([^;]+;\s*if\s*\(\s*thing\s*!=\s*NULL\s*&&\s*thing->isEquivalentTo\s*\(\s*rider->getTemplate\s*\(\s*\)\s*\)\s*\)/g;
    const guardedMatches = [...body.matchAll(guardedComparison)];
    const comparisons = [...body.matchAll(/thing->isEquivalentTo\s*\(/g)];

    if (guardedMatches.length !== 1) {
      throw new Error(`expected one null-guarded rider-template comparison, found ${guardedMatches.length}`);
    }
    if (comparisons.length !== guardedMatches.length) {
      throw new Error("contains an unguarded rider-template comparison");
    }
  } catch (error) {
    errors.push(`${method}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (errors.length > 0) {
  console.error(JSON.stringify({ ok: false, source: sourcePath, errors }));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, source: sourcePath, guardedMethods: methods }));
