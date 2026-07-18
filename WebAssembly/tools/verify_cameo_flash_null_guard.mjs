#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(toolDir, "..", "..");
const sourcePath = "GeneralsMD/Code/GameEngine/Source/GameLogic/ScriptEngine/ScriptActions.cpp";
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

function functionBody(name) {
  const signature = new RegExp(`void\\s+ScriptActions::${name}\\s*\\(`);
  const match = signature.exec(source);
  if (!match) {
    throw new Error(`${name}: definition not found`);
  }

  const openBrace = source.indexOf("{", match.index + match[0].length);
  if (openBrace < 0) {
    throw new Error(`${name}: body not found`);
  }
  return extractBlock(source, openBrace, name).body;
}

function requireMatch(text, pattern, label) {
  const match = pattern.exec(text);
  if (!match) {
    throw new Error(`doCameoFlash: missing ${label}`);
  }
  return match;
}

const errors = [];
try {
  const body = functionBody("doCameoFlash");
  const lookup = requireMatch(
    body,
    /button\s*=\s*TheControlBar->findCommandButton\s*\(\s*name\s*\)\s*;/,
    "command button lookup",
  );
  const guard = requireMatch(
    body,
    /if\s*\(\s*(?:button\s*==\s*NULL|!\s*button)\s*\)/,
    "missing-button guard",
  );
  const guardOpenBrace = body.indexOf("{", guard.index + guard[0].length);
  if (guardOpenBrace < 0) {
    throw new Error("doCameoFlash: missing guard body");
  }
  const guardBlock = extractBlock(body, guardOpenBrace, "doCameoFlash missing-button guard");

  requireMatch(guardBlock.body, /DEBUG_CRASH\s*\(/, "missing-button diagnostic");
  requireMatch(guardBlock.body, /\breturn\s*;/, "early return after missing button");

  const flashCount = requireMatch(
    body,
    /button->setFlashCount\s*\(\s*count\s*\)\s*;/,
    "valid-button flash count update",
  );
  const controlBarFlash = requireMatch(
    body,
    /TheControlBar->setFlash\s*\(\s*TRUE\s*\)\s*;/,
    "valid-button control-bar flash update",
  );

  if (lookup.index >= guard.index) {
    throw new Error("doCameoFlash: missing-button guard precedes the command button lookup");
  }
  if (flashCount.index <= guardBlock.end || controlBarFlash.index <= flashCount.index) {
    throw new Error("doCameoFlash: valid-button flash updates are not ordered after the guard");
  }
} catch (error) {
  errors.push(error instanceof Error ? error.message : String(error));
}

if (errors.length > 0) {
  console.error(JSON.stringify({ ok: false, source: sourcePath, errors }));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, source: sourcePath, guard: "diagnose-and-return" }));
