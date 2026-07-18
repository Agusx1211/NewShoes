#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(toolDir, "..", "..");
const sourcePath = "GeneralsMD/Code/GameEngine/Source/GameLogic/ScriptEngine/ScriptConditions.cpp";
const source = readFileSync(resolve(repoRoot, sourcePath), "utf8");

function extractBlock(text, openBrace, label) {
  let depth = 0;
  for (let index = openBrace; index < text.length; ++index) {
    if (text[index] === "{") {
      ++depth;
    } else if (text[index] === "}" && --depth === 0) {
      return { body: text.slice(openBrace + 1, index), end: index + 1 };
    }
  }
  throw new Error(`${label}: unterminated block`);
}

function requireMatch(text, pattern, label) {
  const match = pattern.exec(text);
  if (!match) {
    throw new Error(`evaluateEnemySighted: missing ${label}`);
  }
  return match;
}

const errors = [];
try {
  const signature = /Bool\s+ScriptConditions::evaluateEnemySighted\s*\(/;
  const functionMatch = requireMatch(source, signature, "definition");
  const functionOpenBrace = source.indexOf("{", functionMatch.index + functionMatch[0].length);
  const functionBlock = extractBlock(source, functionOpenBrace, "evaluateEnemySighted");

  const switchMatch = requireMatch(
    functionBlock.body,
    /switch\s*\(\s*pAllianceParm->getInt\s*\(\s*\)\s*\)/,
    "relationship switch",
  );
  const switchOpenBrace = functionBlock.body.indexOf("{", switchMatch.index + switchMatch[0].length);
  const switchBlock = extractBlock(functionBlock.body, switchOpenBrace, "relationship switch");

  requireMatch(
    switchBlock.body,
    /case\s+Parameter::REL_NEUTRAL\s*:[\s\S]*?relationDescriber\s*=\s*PartitionFilterRelationship::ALLOW_NEUTRAL\s*;/,
    "neutral relationship mapping",
  );
  requireMatch(
    switchBlock.body,
    /case\s+Parameter::REL_FRIEND\s*:[\s\S]*?relationDescriber\s*=\s*PartitionFilterRelationship::ALLOW_ALLIES\s*;/,
    "friendly relationship mapping",
  );
  requireMatch(
    switchBlock.body,
    /case\s+Parameter::REL_ENEMY\s*:[\s\S]*?relationDescriber\s*=\s*PartitionFilterRelationship::ALLOW_ENEMIES\s*;/,
    "enemy relationship mapping",
  );

  const invalidArm = requireMatch(switchBlock.body, /default\s*:/, "invalid-relationship arm");
  const invalidBody = switchBlock.body.slice(invalidArm.index + invalidArm[0].length);
  requireMatch(invalidBody, /DEBUG_CRASH\s*\(/, "invalid-relationship diagnostic");
  requireMatch(invalidBody, /\breturn\s+false\s*;/, "invalid-relationship early return");

  const filter = requireMatch(
    functionBlock.body,
    /PartitionFilterRelationship\s+filterTeam\s*\(\s*theObj\s*,\s*relationDescriber\s*\)\s*;/,
    "relationship filter construction",
  );
  if (filter.index <= switchBlock.end) {
    throw new Error("evaluateEnemySighted: relationship filter is constructed before validation completes");
  }
} catch (error) {
  errors.push(error instanceof Error ? error.message : String(error));
}

if (errors.length > 0) {
  console.error(JSON.stringify({ ok: false, source: sourcePath, errors }));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, source: sourcePath, invalidRelation: "diagnose-and-return" }));
