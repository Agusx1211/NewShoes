// extract_splash_art.mjs — pull the ORIGINAL boot splash bitmap out of the
// real game archives for the play page's loading screen.
//
// The original game shows Data\English\Install_Final.bmp while it boots
// (GeneralsMD/Code/Main/WinMain.cpp: gLoadScreenBitmap = LoadImage(...,
// "Install_Final.bmp", ...)). That bitmap ships inside EnglishZH.big. This
// tool extracts it and converts BMP -> PNG (browsers get a compressed,
// universally supported <img> source) into the gitignored
// artifacts/real-assets/ directory the harness static server already serves,
// so no proprietary art is ever committed. harness/play.html loads
// ../artifacts/real-assets/Install_Final.png and falls back to its plain
// gradient background when the file is absent (404).
//
// Usage: node tools/extract_splash_art.mjs [EnglishZH.big] [out.png]
// Defaults: artifacts/real-assets/EnglishZH.big ->
//           artifacts/real-assets/Install_Final.png
// Run once after tools/extract_zh_runtime_archives.sh (which invokes this).
//
// No dependencies: BIGF directory walk + uncompressed-BMP decode + a minimal
// PNG encoder over node:zlib.

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const toolDir = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(toolDir, "..");

const SPLASH_ENTRY = "data\\english\\install_final.bmp";

function findBigEntry(big, wantedLowerCasePath) {
  if (big.toString("ascii", 0, 4) !== "BIGF") {
    throw new Error("not a BIGF archive");
  }
  const entryCount = big.readUInt32BE(8);
  let offset = 16;
  for (let index = 0; index < entryCount; index += 1) {
    const dataOffset = big.readUInt32BE(offset);
    const dataLength = big.readUInt32BE(offset + 4);
    let end = offset + 8;
    while (end < big.length && big[end] !== 0) {
      end += 1;
    }
    const name = big.toString("latin1", offset + 8, end);
    offset = end + 1;
    if (name.toLowerCase() === wantedLowerCasePath) {
      return big.subarray(dataOffset, dataOffset + dataLength);
    }
  }
  return null;
}

// Decode an uncompressed BI_RGB 24/32-bit BMP into RGB rows (top-down).
function decodeBmp(bmp) {
  if (bmp.toString("ascii", 0, 2) !== "BM") {
    throw new Error("not a BMP file");
  }
  const dataOffset = bmp.readUInt32LE(10);
  const width = bmp.readInt32LE(18);
  const rawHeight = bmp.readInt32LE(22);
  const bitCount = bmp.readUInt16LE(28);
  const compression = bmp.readUInt32LE(30);
  if (compression !== 0 || (bitCount !== 24 && bitCount !== 32)) {
    throw new Error(`unsupported BMP variant: ${bitCount}bpp compression=${compression}`);
  }
  const height = Math.abs(rawHeight);
  const bottomUp = rawHeight > 0;
  const bytesPerPixel = bitCount / 8;
  const stride = Math.ceil((width * bytesPerPixel) / 4) * 4;
  const rgb = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    const srcRow = dataOffset + (bottomUp ? height - 1 - y : y) * stride;
    for (let x = 0; x < width; x += 1) {
      const src = srcRow + x * bytesPerPixel;
      const dst = (y * width + x) * 3;
      rgb[dst] = bmp[src + 2]; // BMP stores BGR(A)
      rgb[dst + 1] = bmp[src + 1];
      rgb[dst + 2] = bmp[src];
    }
  }
  return { width, height, rgb };
}

const crcTable = new Uint32Array(256).map((_value, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, "ascii");
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + data.length)), 8 + data.length);
  return chunk;
}

function encodePng({ width, height, rgb }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  // scanlines with filter byte 0 (None); zlib does the compressing.
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

async function main() {
  const bigPath = resolve(process.argv[2] ?? resolve(wasmRoot, "artifacts/real-assets/EnglishZH.big"));
  const outPath = resolve(process.argv[3] ?? resolve(wasmRoot, "artifacts/real-assets/Install_Final.png"));

  const big = await readFile(bigPath);
  const bmp = findBigEntry(big, SPLASH_ENTRY);
  if (!bmp) {
    throw new Error(`entry not found in ${bigPath}: ${SPLASH_ENTRY}`);
  }
  const image = decodeBmp(bmp);
  const png = encodePng(image);
  await writeFile(outPath, png);
  process.stdout.write(`${outPath} (${image.width}x${image.height}, ${png.length} bytes)\n`);
}

main().catch((error) => {
  process.stderr.write(`extract_splash_art: ${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
