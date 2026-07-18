#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(toolDir, "..", "..");
const headerPath = "GeneralsMD/Code/GameEngine/Include/GameLogic/Module/ParticleUplinkCannonUpdate.h";
const sourcePath = "GeneralsMD/Code/GameEngine/Source/GameLogic/Object/Update/ParticleUplinkCannonUpdate.cpp";
const iniHeaderPath = "GeneralsMD/Code/GameEngine/Include/Common/INI.h";
const iniSourcePath = "GeneralsMD/Code/GameEngine/Source/Common/INI/INI.cpp";
const header = readFileSync(resolve(repoRoot, headerPath), "utf8");
const source = readFileSync(resolve(repoRoot, sourcePath), "utf8");
const iniHeader = readFileSync(resolve(repoRoot, iniHeaderPath), "utf8");
const iniSource = readFileSync(resolve(repoRoot, iniSourcePath), "utf8");

function expect(pattern, text, message) {
  if (!pattern.test(text)) {
    throw new Error(message);
  }
}

function functionBody(text, signature, message) {
  const match = signature.exec(text);
  if (!match) throw new Error(message);
  const start = text.indexOf("{", match.index);
  let depth = 0;
  for (let index = start; index < text.length; ++index) {
    if (text[index] === "{") ++depth;
    if (text[index] === "}" && --depth === 0) return text.slice(start + 1, index);
  }
  throw new Error(`${message}: unterminated body`);
}

expect(
  /^#define\s+MAX_OUTER_NODES\s+16\s*$/m,
  header,
  "ParticleUplinkCannonUpdate must retain its fixed 16-node capacity",
);
for (const member of [
  "m_outerNodeOrientations",
  "m_outerNodePositions",
  "m_outerSystemIDs",
  "m_laserBeamIDs",
]) {
  expect(
    new RegExp(`${member}\\s*\\[\\s*MAX_OUTER_NODES\\s*\\]`),
    header,
    `${member} must remain bounded by MAX_OUTER_NODES`,
  );
}

expect(
  /static\s+const\s+INIUnsignedIntRange\s+\w+\s*=\s*\{\s*0\s*,\s*MAX_OUTER_NODES\s*\}\s*;/,
  source,
  "missing inclusive OuterEffectNumBones range metadata",
);
expect(
  /\{\s*"OuterEffectNumBones"\s*,\s*INI::parseUnsignedIntRange\s*,\s*&\w+\s*,\s*offsetof\s*\(\s*ParticleUplinkCannonUpdateModuleData\s*,\s*m_outerEffectNumBones\s*\)\s*\}/,
  source,
  "OuterEffectNumBones is not wired to the bounded unsigned parser",
);

if (/\{\s*"OuterEffectNumBones"\s*,\s*INI::parseUnsignedInt\s*,/.test(source)) {
  throw new Error("OuterEffectNumBones still accepts unrestricted unsigned values");
}

expect(
  /struct\s+INIUnsignedIntRange[\s\S]*?Bool\s+contains\s*\(\s*UnsignedInt\s+value\s*\)\s*const/,
  iniHeader,
  "missing testable inclusive unsigned range contract",
);
const parserBody = functionBody(
  iniSource,
  /void\s+INI::parseUnsignedIntRange\s*\(/,
  "missing INI::parseUnsignedIntRange",
);
const parseIndex = parserBody.search(/value\s*=\s*scanUnsignedInt\s*\(/);
const rejectIndex = parserBody.search(/if\s*\(\s*!range->contains\s*\(\s*value\s*\)\s*\)/);
const throwIndex = parserBody.search(/throw\s+INI_INVALID_DATA\s*;/);
const storeIndex = parserBody.search(/\*\s*\(\s*UnsignedInt\s*\*\s*\)\s*store\s*=\s*value\s*;/);
if (!(parseIndex >= 0 && rejectIndex > parseIndex && throwIndex > rejectIndex && storeIndex > throwIndex)) {
  throw new Error("bounded parser must reject out-of-range values before writing the destination");
}

console.log(JSON.stringify({
  ok: true,
  capacity: 16,
  field: "OuterEffectNumBones",
  parser: "INI::parseUnsignedIntRange",
  sources: [iniHeaderPath, iniSourcePath, headerPath, sourcePath],
}));
