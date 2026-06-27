import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const [inputPath, outputPath, symbolName] = process.argv.slice(2);

if (!inputPath || !outputPath || !symbolName) {
  console.error("usage: generate_binary_header.mjs <input> <output> <symbol>");
  process.exit(1);
}

if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(symbolName)) {
  console.error(`invalid C++ symbol name: ${symbolName}`);
  process.exit(1);
}

const bytes = await readFile(inputPath);
const lines = [
  "#pragma once",
  "",
  "#include <cstddef>",
  "",
  `static constexpr unsigned char ${symbolName}[] = {`,
];

for (let offset = 0; offset < bytes.length; offset += 12) {
  const row = Array.from(bytes.subarray(offset, offset + 12), (byte) =>
    `0x${byte.toString(16).padStart(2, "0")}`,
  );
  lines.push(`\t${row.join(", ")},`);
}

lines.push("};");
lines.push(`static constexpr std::size_t ${symbolName}Size = sizeof(${symbolName});`);
lines.push("");

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, lines.join("\n"));
