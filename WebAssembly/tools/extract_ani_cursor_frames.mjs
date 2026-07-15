// Convert the original Windows animated cursors into browser-consumable CUR
// frames plus a timing manifest. The source .ANI files remain user-supplied
// game assets; generated files live under gitignored artifacts/real-assets.

import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { parseAniCursor } from "../harness/original-cursor-assets.mjs";

const sourceDir = resolve(process.argv[2] ?? "artifacts/real-assets/cursor-source");
const outputDir = resolve(process.argv[3] ?? "artifacts/real-assets/cursors");

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

const cursors = {};
const sourceFiles = (await readdir(sourceDir))
  .filter((name) => name.toLowerCase().endsWith(".ani"))
  .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));

for (const sourceFile of sourceFiles) {
  const key = basename(sourceFile, extname(sourceFile)).toLowerCase();
  if (cursors[key]) {
    throw new Error(`duplicate cursor name after case folding: ${sourceFile}`);
  }
  const parsed = parseAniCursor(await readFile(join(sourceDir, sourceFile)), sourceFile);
  const cursorDir = join(outputDir, key);
  await mkdir(cursorDir, { recursive: true });
  const frameFiles = [];
  for (let index = 0; index < parsed.frames.length; index += 1) {
    const frameFile = `frame-${String(index).padStart(3, "0")}.cur`;
    const frame = parsed.frames[index];
    if (frame.length < 6 || frame.readUInt16LE(0) !== 0 || frame.readUInt16LE(2) !== 2) {
      throw new Error(`${sourceFile} frame ${index} is not an embedded CUR image`);
    }
    await writeFile(join(cursorDir, frameFile), frame);
    frameFiles.push(`${key}/${frameFile}`);
  }
  cursors[key] = {
    sourceFile,
    width: parsed.header.width,
    height: parsed.header.height,
    frames: frameFiles,
    sequence: parsed.sequence,
    rates: parsed.rates,
  };
}

if (Object.keys(cursors).length === 0) {
  throw new Error(`no .ANI cursor files found in ${sourceDir}`);
}

const manifest = {
  schema: "cnc.original-ani-cursors.v1",
  timingUnitHz: 60,
  cursors,
};
await writeFile(join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`${Object.keys(cursors).length} original animated cursors extracted\n`);
