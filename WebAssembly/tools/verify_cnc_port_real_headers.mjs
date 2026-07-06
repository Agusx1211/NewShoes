#!/usr/bin/env node
// Audits cnc-port objects for engine-path shim headers that can change class ABI.

import { existsSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const toolDir = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(toolDir, "..");
const repoRoot = resolve(wasmRoot, "..");

const DEFAULT_BUILD_DIR = resolve(wasmRoot, "build/wasm");
const DEFAULT_DIST_JS = resolve(wasmRoot, "dist/cnc-port.js");

const activeShadowHeaderSuffixes = [
  "WebAssembly/shims/Common/GlobalData.h",
  "WebAssembly/shims/Common/INI.h",
  "WebAssembly/shims/Common/STLTypedefs.h",
  "WebAssembly/shims/Common/GameAudio.h",
];

// Retired shadow paths should never appear in fresh deps, but keeping the
// suffix here makes stale/misrouted build objects fail loudly.
const retiredShadowHeaderSuffixes = [
  "WebAssembly/shims/GameNetwork/WOLBrowser/WebBrowser.h",
  "WebAssembly/shims/Common/Xfer.h",
  "WebAssembly/shims/GameLogic/GameLogic.h",
];

const shadowHeaderSuffixes = [
  ...activeShadowHeaderSuffixes,
  ...retiredShadowHeaderSuffixes,
];

function usage() {
  return [
    "Usage: node tools/verify_cnc_port_real_headers.mjs [options]",
    "",
    "Options:",
    "  --build-dir <path>       CMake/Ninja build directory",
    "  --dist-js <path>         Built cnc-port.js path",
    "  --fail-on-linked         Also fail on linked archive offenders",
    "  --help                   Show this help",
  ].join("\n");
}

function parseArgs(argv) {
  const options = {
    buildDir: DEFAULT_BUILD_DIR,
    distJs: DEFAULT_DIST_JS,
    failOnLinked: false,
  };

  for (let index = 0; index < argv.length; ++index) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (arg === "--fail-on-linked") {
      options.failOnLinked = true;
      continue;
    }
    if (arg === "--build-dir" || arg === "--dist-js") {
      const value = argv[++index];
      if (!value) {
        throw new Error(`${arg} requires a value`);
      }
      const resolved = resolve(process.cwd(), value);
      if (arg === "--build-dir") {
        options.buildDir = resolved;
      } else {
        options.distJs = resolved;
      }
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with exit ${result.status}\n${result.stderr ?? ""}`,
    );
  }
  return result.stdout ?? "";
}

function requirePath(path, hint) {
  if (!existsSync(path)) {
    throw new Error(`${relative(repoRoot, path)} is missing. ${hint}`);
  }
}

function normalizePath(path) {
  return path.replaceAll("\\", "/");
}

function relativeInputPath(input, buildDir) {
  const clean = input.replace(/^\|+\s*/, "").trim();
  if (!clean) {
    return null;
  }
  if (isAbsolute(clean)) {
    return normalizePath(relative(buildDir, clean));
  }
  return normalizePath(clean);
}

function parseLinkInputs(queryOutput, buildDir) {
  const objects = new Set();
  const archiveTargets = new Set();
  let inInputs = false;

  for (const rawLine of queryOutput.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    if (line.startsWith("input:")) {
      inInputs = true;
      continue;
    }
    if (!inInputs) {
      continue;
    }
    if (line.startsWith("outputs:")) {
      break;
    }

    if (line.startsWith("||")) {
      continue;
    }

    const rel = relativeInputPath(line, buildDir);
    if (!rel) {
      continue;
    }
    if (rel.endsWith(".o")) {
      objects.add(rel);
      continue;
    }
    if (rel.endsWith(".a")) {
      const name = basename(rel);
      if (name.startsWith("lib") && name.endsWith(".a")) {
        archiveTargets.add(name.slice(3, -2));
      }
    }
  }

  return { objects, archiveTargets };
}

function parseDeps(depsOutput, linkInputs) {
  const direct = new Map();
  const linked = new Map();
  let currentObject = null;

  for (const rawLine of depsOutput.split(/\r?\n/)) {
    const blockMatch = rawLine.match(/^(\S+): #deps/);
    if (blockMatch) {
      currentObject = normalizePath(blockMatch[1]);
      continue;
    }
    if (!currentObject) {
      continue;
    }

    const dep = normalizePath(rawLine.trim());
    if (!dep) {
      continue;
    }
    const suffix = shadowHeaderSuffixes.find((header) => dep.endsWith(header));
    if (!suffix) {
      continue;
    }

    if (linkInputs.objects.has(currentObject)) {
      appendOffender(direct, currentObject, suffix);
      continue;
    }

    const linkedTarget = linkedTargetForObject(currentObject, linkInputs.archiveTargets);
    if (linkedTarget) {
      appendOffender(linked, `${linkedTarget}:${currentObject}`, suffix);
    }
  }

  return { direct, linked };
}

function linkedTargetForObject(object, archiveTargets) {
  const match = object.match(/^CMakeFiles\/([^/]+)\.dir\//);
  if (!match) {
    return null;
  }
  const target = match[1];
  return archiveTargets.has(target) ? target : null;
}

function appendOffender(map, object, header) {
  const headers = map.get(object) ?? new Set();
  headers.add(header);
  map.set(object, headers);
}

function printOffenders(title, offenders, limit = 30) {
  console.log(`${title}: ${offenders.size}`);
  let printed = 0;
  for (const [object, headers] of offenders) {
    if (printed >= limit) {
      console.log(`  ... ${offenders.size - printed} more`);
      break;
    }
    console.log(`  ${object}`);
    for (const header of headers) {
      console.log(`    ${header}`);
    }
    printed += 1;
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  requirePath(options.buildDir, "Run npm run build:port first.");
  requirePath(options.distJs, "Run npm run build:port first.");

  const query = run("ninja", ["-C", options.buildDir, "-t", "query", options.distJs]);
  const linkInputs = parseLinkInputs(query, options.buildDir);
  if (linkInputs.objects.size === 0) {
    throw new Error("No cnc-port object inputs found in ninja query output.");
  }

  const deps = run("ninja", ["-C", options.buildDir, "-t", "deps"]);
  const offenders = parseDeps(deps, linkInputs);

  console.log(`Checked direct cnc-port objects: ${linkInputs.objects.size}`);
  console.log(`Checked linked archive targets: ${linkInputs.archiveTargets.size}`);
  printOffenders("Direct cnc-port shadow-header offenders", offenders.direct);
  printOffenders("Linked archive shadow-header offenders", offenders.linked, 20);

  if (offenders.direct.size > 0 || (options.failOnLinked && offenders.linked.size > 0)) {
    process.exit(1);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
