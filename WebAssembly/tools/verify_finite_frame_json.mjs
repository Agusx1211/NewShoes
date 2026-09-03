#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(toolDir, "..", "..");
const displayPath =
  "GeneralsMD/Code/GameEngineDevice/Source/W3DDevice/GameClient/W3DDisplay.cpp";
const framePath = "WebAssembly/src/wasm_real_engine_init.cpp";
const displaySource = readFileSync(resolve(repoRoot, displayPath), "utf8");
const frameSource = readFileSync(resolve(repoRoot, framePath), "utf8");

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

function functionBody(source, signature, label) {
  const match = signature.exec(source);
  if (!match) {
    throw new Error(`${label}: definition not found`);
  }
  const openBrace = source.indexOf("{", match.index + match[0].length);
  if (openBrace < 0) {
    throw new Error(`${label}: body not found`);
  }
  return extractBlock(source, openBrace, label);
}

function requireMatch(source, pattern, label) {
  if (!pattern.test(source)) {
    throw new Error(`missing ${label}`);
  }
}

const errors = [];
try {
  const averageBody = functionBody(
    displaySource,
    /void\s+W3DDisplay::updateAverageFPS\s*\(\s*void\s*\)/,
    "W3DDisplay::updateAverageFPS",
  );
  requireMatch(
    averageBody,
    /std::isfinite\s*\(\s*elapsedSeconds\s*\)[\s\S]*?elapsedSeconds\s*>\s*0\.0/,
    "finite positive elapsed-time guard",
  );
  requireMatch(
    averageBody,
    /currentFPS\s*=\s*1\.0\s*\/\s*elapsedSeconds\s*;/,
    "FPS calculation",
  );
  requireMatch(
    averageBody,
    /std::isfinite\s*\(\s*currentFPS\s*\)[\s\S]*?fpsHistory\s*\[\s*historyOffset\+\+\s*\]\s*=\s*currentFPS/,
    "finite FPS history guard",
  );

  const serializerBody = functionBody(
    frameSource,
    /void\s+append_json_real\s*\(\s*std::string\s*&json\s*,\s*Real\s+value\s*\)/,
    "append_json_real",
  );
  requireMatch(
    serializerBody,
    /!\s*std::isfinite\s*\(\s*value\s*\)[\s\S]*?json\s*\+=\s*"null"/,
    "non-finite JSON null serialization",
  );

  for (const endpoint of [
    {
      label: "append_real_engine_frame_summary_state",
      signature:
        /void\s+append_real_engine_frame_summary_state\s*\(\s*std::string\s*&json\s*\)/,
    },
    {
      label: "run_real_engine_frame_paced",
      signature:
        /static\s+const\s+char\s*\*\s*run_real_engine_frame_paced\s*\(\s*int\s+run_logic\s*,\s*bool\s+render_frame\s*\)/,
    },
  ]) {
    const body = functionBody(frameSource, endpoint.signature, endpoint.label);
    requireMatch(
      body,
      /append_json_real\s*\(\s*json\s*,\s*TheDisplay->getAverageFPS\s*\(\s*\)\s*\)\s*;/,
      `${endpoint.label} finite FPS serialization`,
    );
    if (/std::to_string\s*\(\s*TheDisplay->getAverageFPS\s*\(\s*\)\s*\)/.test(body)) {
      throw new Error(`${endpoint.label}: unsafe FPS serialization remains`);
    }
  }
} catch (error) {
  errors.push(error instanceof Error ? error.message : String(error));
}

if (errors.length > 0) {
  console.error(JSON.stringify({ ok: false, sources: [displayPath, framePath], errors }));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  sources: [displayPath, framePath],
  behavior: "non-finite frame telemetry serializes as JSON null",
}));
