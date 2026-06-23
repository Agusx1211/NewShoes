import { closeSync, openSync, readSync, statSync, writeSync } from "node:fs";

const [sourcePath, outputPath] = process.argv.slice(2);

if (!sourcePath || !outputPath) {
  console.error("Usage: node tools/mode1_2352_to_iso.mjs <source.bin> <output.iso>");
  process.exit(1);
}

const sectorSize = 2352;
const payloadOffset = 16;
const payloadSize = 2048;
const sourceSize = statSync(sourcePath).size;

if (sourceSize % sectorSize !== 0) {
  throw new Error(`source size ${sourceSize} is not aligned to ${sectorSize} byte MODE1 sectors`);
}

const input = openSync(sourcePath, "r");
const output = openSync(outputPath, "w");
const sector = Buffer.allocUnsafe(sectorSize);

try {
  let sectors = 0;
  while (true) {
    const bytesRead = readSync(input, sector, 0, sectorSize, null);
    if (bytesRead === 0) {
      break;
    }
    if (bytesRead !== sectorSize) {
      throw new Error(`partial sector read: ${bytesRead}`);
    }

    writeSync(output, sector.subarray(payloadOffset, payloadOffset + payloadSize));
    ++sectors;
  }

  console.log(JSON.stringify({
    source: sourcePath,
    output: outputPath,
    sectors,
    bytes: sectors * payloadSize,
  }, null, 2));
} finally {
  closeSync(input);
  closeSync(output);
}
