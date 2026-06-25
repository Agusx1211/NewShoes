import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const wasmDir = resolve(scriptDir, "..");
const repoRoot = resolve(wasmDir, "..");
const assetsDir = resolve(repoRoot, "assets");
const realAssetsDir = resolve(wasmDir, "artifacts/real-assets");
const forceConvert = process.env.VERIFY_ASSETS_FORCE_CONVERT === "1";

const discs = [
  {
    label: "Disc 1",
    source: resolve(assetsDir, "Command & Conquer - Generals - Zero Hour (USA) (Disc 1).bin"),
    iso: resolve(realAssetsDir, "Disc1.iso"),
  },
  {
    label: "Disc 2",
    source: resolve(assetsDir, "Command & Conquer - Generals - Zero Hour (USA) (Disc 2).bin"),
    iso: resolve(realAssetsDir, "Disc2.iso"),
  },
];

function fail(message) {
  throw new Error(message);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: wasmDir,
    encoding: "utf8",
  });

  if (result.error) {
    fail(`${command} ${args.join(" ")} failed: ${result.error.message}`);
  }

  if (result.status !== 0) {
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
    fail(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }

  return result.stdout.trim();
}

function expectedIsoSize(sourcePath) {
  const sourceSize = statSync(sourcePath).size;
  const sectorSize = 2352;
  const payloadSize = 2048;

  if (sourceSize % sectorSize !== 0) {
    fail(`${sourcePath} is not aligned to ${sectorSize} byte MODE1 sectors`);
  }

  return {
    sectors: sourceSize / sectorSize,
    bytes: (sourceSize / sectorSize) * payloadSize,
  };
}

function verifyDiscConversion(disc) {
  if (!existsSync(disc.source)) {
    fail(`${disc.label} source image not found: ${disc.source}`);
  }

  if (forceConvert || !existsSync(disc.iso) || statSync(disc.source).mtimeMs > statSync(disc.iso).mtimeMs) {
    run(process.execPath, [resolve(scriptDir, "mode1_2352_to_iso.mjs"), disc.source, disc.iso]);
  }

  if (!existsSync(disc.iso)) {
    fail(`${disc.label} ISO was not created: ${disc.iso}`);
  }

  const expected = expectedIsoSize(disc.source);
  const actualBytes = statSync(disc.iso).size;
  if (actualBytes !== expected.bytes) {
    fail(`${disc.label} ISO size ${actualBytes} did not match expected ${expected.bytes}`);
  }

  return {
    label: disc.label,
    source: disc.source,
    iso: disc.iso,
    sectors: expected.sectors,
    isoBytes: actualBytes,
  };
}

function verifyInizhExtraction() {
  const extractedPath = run("bash", [resolve(scriptDir, "extract_zh_big_sample.sh")]);
  const inizhPath = extractedPath.split(/\r?\n/).at(-1);

  if (!inizhPath || !existsSync(inizhPath)) {
    fail(`INIZH.big was not extracted: ${inizhPath}`);
  }

  const header = readFileSync(inizhPath).subarray(0, 4).toString("ascii");
  if (header !== "BIGF") {
    fail(`INIZH.big has unexpected header ${JSON.stringify(header)}`);
  }

  const size = statSync(inizhPath).size;
  if (size <= 0) {
    fail("INIZH.big is empty");
  }

  return {
    path: inizhPath,
    bytes: size,
    header,
  };
}

mkdirSync(realAssetsDir, { recursive: true });

const summary = {
  ok: true,
  forceConvert,
  discs: discs.map(verifyDiscConversion),
  inizh: verifyInizhExtraction(),
};

console.log(JSON.stringify(summary, null, 2));
