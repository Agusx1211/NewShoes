#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(toolDir, "..", "..");
const sourcePath = "GeneralsMD/Code/GameEngine/Source/Common/INI/INIWebpageURL.cpp";
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
    throw new Error(`parseWebpageURLDefinition: missing ${label}`);
  }
  return match;
}

function requireGuard(body, pattern, label) {
  const match = requireMatch(body, pattern, label);
  const openBrace = body.indexOf("{", match.index + match[0].length);
  const block = extractBlock(body, openBrace, label);
  requireMatch(block.body, /DEBUG_CRASH\s*\(/, `${label} diagnostic`);
  requireMatch(block.body, /\breturn\s*;/, `${label} early return`);
  return { index: match.index, end: block.end };
}

const errors = [];
try {
  const signature = /void\s+INI::parseWebpageURLDefinition\s*\(/;
  const functionMatch = requireMatch(source, signature, "definition");
  const functionOpenBrace = source.indexOf("{", functionMatch.index + functionMatch[0].length);
  const functionBlock = extractBlock(source, functionOpenBrace, "parseWebpageURLDefinition");
  const body = functionBlock.body;

  const ownerGuard = requireGuard(
    body,
    /if\s*\(\s*TheWebBrowser\s*==\s*(?:NULL|nullptr)\s*\)/,
    "browser-owner guard",
  );
  const tokenRead = requireMatch(body, /ini->getNextToken\s*\(\s*\)/, "INI token read");
  if (ownerGuard.end >= tokenRead.index) {
    throw new Error("parseWebpageURLDefinition: browser owner is not validated before reading the definition");
  }

  const lookup = requireMatch(body, /TheWebBrowser->findURL\s*\(\s*tag\s*\)/, "URL lookup");
  const allocation = requireMatch(body, /TheWebBrowser->makeNewURL\s*\(\s*tag\s*\)/, "URL allocation");
  const afterAllocationIndex = allocation.index + allocation[0].length;
  const urlGuard = requireGuard(
    body.slice(afterAllocationIndex),
    /if\s*\(\s*url\s*==\s*(?:NULL|nullptr)\s*\)/,
    "URL allocation guard",
  );
  urlGuard.index += afterAllocationIndex;
  urlGuard.end += afterAllocationIndex;
  const parse = requireMatch(
    body,
    /ini->initFromINI\s*\(\s*url\s*,\s*url->getFieldParse\s*\(\s*\)\s*\)/,
    "URL definition parse",
  );

  if (lookup.index <= tokenRead.index || allocation.index <= lookup.index) {
    throw new Error("parseWebpageURLDefinition: URL lookup/allocation order changed");
  }
  if (urlGuard.index <= allocation.index || urlGuard.end >= parse.index) {
    throw new Error("parseWebpageURLDefinition: URL allocation is not validated before parsing");
  }
} catch (error) {
  errors.push(error instanceof Error ? error.message : String(error));
}

if (errors.length > 0) {
  console.error(JSON.stringify({ ok: false, source: sourcePath, errors }));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, source: sourcePath, guards: ["browser-owner", "url-allocation"] }));
