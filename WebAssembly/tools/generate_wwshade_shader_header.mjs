#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const [, , inputPath, outputPath] = process.argv;

if (!inputPath || !outputPath) {
  console.error('usage: generate_wwshade_shader_header.mjs <input.vsh|psh> <output.h>');
  process.exit(2);
}

const parsed = path.parse(inputPath);
const extension = parsed.ext.startsWith('.') ? parsed.ext.slice(1) : parsed.ext;
const symbol = `${parsed.name}_${extension}_code`;
const shaderBytes = fs.readFileSync(inputPath);
const bytes = Buffer.concat([shaderBytes, Buffer.from([0])]);

const words = [];
for (let offset = 0; offset < bytes.length; offset += 4) {
  let word = 0;
  for (let index = 0; index < 4; index += 1) {
    const byte = bytes[offset + index] ?? 0;
    word |= byte << (index * 8);
  }
  words.push(word >>> 0);
}

const lines = [
  '#pragma once',
  '',
  '#include "d3d8.h"',
  '',
  `static DWORD ${symbol}[] = {`,
];

for (let index = 0; index < words.length; index += 8) {
  const chunk = words.slice(index, index + 8);
  lines.push(`\t${chunk.map((word) => `0x${word.toString(16).padStart(8, '0')}UL`).join(', ')},`);
}

lines.push('};', '');

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${lines.join('\n')}`);
