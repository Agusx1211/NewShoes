#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(toolDir, "..", "..");
const sourcePath = "GeneralsMD/Code/GameEngine/Source/GameLogic/AI/AIPlayer.cpp";
const source = readFileSync(resolve(repoRoot, sourcePath), "utf8");

function functionBody(name) {
  const signature = new RegExp(`Object\\s*\\*AIPlayer::${name}\\s*\\(`);
  const match = signature.exec(source);
  if (!match) {
    throw new Error(`${name}: definition not found`);
  }

  const openBrace = source.indexOf("{", match.index + match[0].length);
  if (openBrace < 0) {
    throw new Error(`${name}: body not found`);
  }

  let depth = 0;
  for (let index = openBrace; index < source.length; ++index) {
    if (source[index] === "{") {
      ++depth;
    } else if (source[index] === "}" && --depth === 0) {
      return source.slice(openBrace + 1, index);
    }
  }

  throw new Error(`${name}: unterminated body`);
}

function requireOrdered(body, name, checks) {
  let previous = -1;
  const positions = {};

  for (const [label, pattern] of checks) {
    const match = pattern.exec(body);
    if (!match) {
      throw new Error(`${name}: missing ${label}`);
    }
    if (match.index <= previous) {
      throw new Error(`${name}: ${label} is out of order`);
    }
    previous = match.index;
    positions[label] = match.index;
  }

  return positions;
}

function inspectPath(name) {
  const body = functionBody(name);
  const positions = requireOrdered(body, name, [
    ["false initialization", /Bool\s+gotOffset\s*=\s*false\s*;/],
    [
      "nontrivial offset predicate",
      /fabs\s*\(\s*info->getRallyOffset\(\)->x\s*\)\s*>\s*1\.0f\s*\|\|\s*fabs\s*\(\s*info->getRallyOffset\(\)->y\s*\)\s*>\s*1\.0f/,
    ],
    ["true assignment", /gotOffset\s*=\s*true\s*;/],
    ["natural rally fallback", /getNaturalRallyPoint\s*\(\s*rallyPoint\s*\)/],
    ["guarded offset application", /if\s*\(\s*gotOffset\s*\)/],
    ["x offset", /rallyPoint\.x\s*\+=\s*info->getRallyOffset\(\)->x\s*;/],
    ["y offset", /rallyPoint\.y\s*\+=\s*info->getRallyOffset\(\)->y\s*;/],
    ["rally point update", /setRallyPoint\s*\(\s*&rallyPoint\s*\)/],
  ]);

  if (/\bgotOffset\s*;/.test(body)) {
    throw new Error(`${name}: offset predicate still contains a no-op expression`);
  }

  return { name, positions };
}

const errors = [];
const paths = [];
for (const name of ["buildStructureNow", "buildStructureWithDozer"]) {
  try {
    paths.push(inspectPath(name));
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
}

if (errors.length > 0) {
  console.error(JSON.stringify({ ok: false, source: sourcePath, errors }));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, source: sourcePath, paths }));
