#!/usr/bin/env node
// Audits probe-local weak definitions that are linked into cnc-port.
//
// This intentionally does not claim exact final object provenance: Emscripten
// 3.1.6 filters wasm-ld --Map, and llvm-nm on the final wasm does not preserve
// enough weak/strong detail. The useful signal here is which explicit weak
// probe declarations compiled, which exported symbols remain in the final
// runtime symbol table still exposes, and which real linked inputs contain
// strong definitions with the same mangled name.

import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const toolDir = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(toolDir, "..");
const repoRoot = resolve(wasmRoot, "..");

const DEFAULT_BUILD_DIR = resolve(wasmRoot, "build/wasm");
const DEFAULT_DIST_JS = resolve(wasmRoot, "dist/cnc-port.js");
const DEFAULT_DIST_WASM = resolve(wasmRoot, "dist/cnc-port.wasm");

const trackedSources = [
  "WebAssembly/src/wasm_gamenetwork_probe.cpp",
  "WebAssembly/src/wasm_wndproc_probe.cpp",
  "WebAssembly/src/wasm_startup_singletons_probe.cpp",
  "WebAssembly/src/wasm_ww3d_render_probe.cpp",
  "WebAssembly/src/wasm_ww3d_scene_probe.cpp",
  "WebAssembly/src/wasm_ww3d_terrain_probe.cpp",
  "WebAssembly/src/wasm_ww3d_terrain_probe_stubs.cpp",
];

function usage() {
  return [
    "Usage: node tools/verify_cnc_port_weak_stubs.mjs [options]",
    "",
    "Options:",
    "  --build-dir <path>       CMake/Ninja build directory",
    "  --dist-js <path>         Built cnc-port.js path",
    "  --dist-wasm <path>       Built cnc-port.wasm path",
    "  --fail-on-overlap        Exit non-zero if a compiled weak symbol also has a linked strong provider",
    "  --help                   Show this help",
  ].join("\n");
}

function parseArgs(argv) {
  const options = {
    buildDir: DEFAULT_BUILD_DIR,
    distJs: DEFAULT_DIST_JS,
    distWasm: DEFAULT_DIST_WASM,
    failOnOverlap: false,
  };

  for (let index = 0; index < argv.length; ++index) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (arg === "--fail-on-overlap") {
      options.failOnOverlap = true;
      continue;
    }
    if (arg === "--build-dir" || arg === "--dist-js" || arg === "--dist-wasm") {
      const value = argv[++index];
      if (!value) {
        throw new Error(`${arg} requires a value`);
      }
      const resolved = resolve(process.cwd(), value);
      if (arg === "--build-dir") {
        options.buildDir = resolved;
      } else if (arg === "--dist-js") {
        options.distJs = resolved;
      } else {
        options.distWasm = resolved;
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
    input: options.input,
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

function requireFile(path, hint) {
  if (!existsSync(path)) {
    throw new Error(`${relative(repoRoot, path)} is missing. ${hint}`);
  }
}

function objectPathForSource(buildDir, sourceRel) {
  const sourceBase = sourceRel.replace(/^WebAssembly\/src\//, "");
  return resolve(buildDir, "CMakeFiles/cnc-port.dir/src", `${sourceBase}.o`);
}

function parseLinkInputs(queryOutput, buildDir) {
  const inputs = [];
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

    const normalized = line.replace(/^\|+\s*/, "");
    if (!/\.(?:o|a)$/.test(normalized)) {
      continue;
    }
    inputs.push(isAbsolute(normalized) ? normalized : resolve(buildDir, normalized));
  }

  return [...new Set(inputs)];
}

function parseNmLine(line) {
  const match = line.match(/^(?:(.+?):)?\s*([0-9A-Fa-f]+)\s+([A-Za-z])\s+(\S+)(?:\t(.+))?$/);
  if (!match) {
    return null;
  }
  return {
    file: match[1] ?? null,
    address: match[2],
    type: match[3],
    symbol: match[4],
    location: match[5] ?? null,
  };
}

function parseNmDefined(output) {
  const symbols = [];
  for (const line of output.split(/\r?\n/)) {
    const parsed = parseNmLine(line);
    if (parsed) {
      symbols.push(parsed);
    }
  }
  return symbols;
}

function demangle(symbols) {
  if (symbols.length === 0) {
    return new Map();
  }
  const unique = [...new Set(symbols)];
  const output = run("llvm-cxxfilt", [], { input: unique.join("\n") });
  const demangled = output.split(/\r?\n/);
  const map = new Map();
  unique.forEach((symbol, index) => {
    map.set(symbol, demangled[index] || symbol);
  });
  return map;
}

function lastIdentifier(text) {
  const clean = text.replace(/"[^"]*"/g, " ").replace(/\*/g, " ");
  const matches = [...clean.matchAll(/([A-Za-z_~][A-Za-z0-9_:~]*)/g)];
  return matches.length > 0 ? matches[matches.length - 1][1] : null;
}

function weakNameFromLine(line) {
  const asmMatch = line.match(/__asm__\s*\(\s*"([^"]+)"\s*\)/);
  const asmSymbol = asmMatch ? asmMatch[1] : null;
  const beforeAttr = line.slice(0, line.indexOf("__attribute__"));
  const afterAttr = line.slice(line.indexOf("__attribute__")).replace(
    /__attribute__\s*\(\(\s*weak\s*\)\)/,
    "",
  );

  const functionMatches = [...afterAttr.matchAll(/([A-Za-z_~][A-Za-z0-9_:~]*)\s*\(/g)];
  if (functionMatches.length > 0) {
    return { name: functionMatches[functionMatches.length - 1][1], asmSymbol };
  }

  const beforeAsm = asmMatch ? beforeAttr.slice(0, beforeAttr.indexOf("__asm__")) : beforeAttr;
  return { name: lastIdentifier(beforeAsm), asmSymbol };
}

function parseExplicitWeakDeclarations(sourceRel) {
  const path = resolve(repoRoot, sourceRel);
  const source = readFileSync(path, "utf8");
  const declarations = [];

  source.split(/\r?\n/).forEach((rawLine, lineIndex) => {
    const line = rawLine.trim();
    if (!line || line.startsWith("//") || !line.includes("__attribute__")) {
      return;
    }
    if (!/__attribute__\s*\(\(\s*weak\s*\)\)/.test(line)) {
      return;
    }
    const { name, asmSymbol } = weakNameFromLine(line);
    if (!name && !asmSymbol) {
      declarations.push({
        source: sourceRel,
        line: lineIndex + 1,
        name: null,
        asmSymbol,
        lineText: line,
        parseError: "missing-name",
      });
      return;
    }
    declarations.push({
      source: sourceRel,
      line: lineIndex + 1,
      name,
      asmSymbol,
      lineText: line,
    });
  });

  return declarations;
}

function declarationMatchesSymbol(declaration, symbol) {
  if (declaration.asmSymbol && declaration.asmSymbol === symbol.symbol) {
    return true;
  }
  if (!declaration.name) {
    return false;
  }
  if (declaration.name === symbol.symbol) {
    return true;
  }
  const demangled = symbol.demangled ?? symbol.symbol;
  return (
    demangled === declaration.name ||
    demangled.startsWith(`${declaration.name}(`) ||
    demangled.startsWith(`${declaration.name}<`) ||
    demangled.startsWith(`${declaration.name} const`) ||
    demangled.startsWith(`${declaration.name}::`) ||
    demangled.includes(` ${declaration.name}(`)
  );
}

function sourceFileFromLocation(location) {
  if (!location) {
    return null;
  }
  const lineMatch = location.match(/^(.*):(\d+)$/);
  return lineMatch ? lineMatch[1] : location;
}

function sourceLineFromLocation(location) {
  if (!location) {
    return null;
  }
  const lineMatch = location.match(/:(\d+)$/);
  return lineMatch ? Number(lineMatch[1]) : null;
}

function isWeakType(type) {
  return type === "W" || type === "w" || type === "V" || type === "v";
}

function isStrongExternalType(type) {
  return /^[A-Z]$/.test(type) && !isWeakType(type) && type !== "U";
}

function compactProvider(provider) {
  return {
    input: provider.file ? relative(repoRoot, resolve(repoRoot, provider.file)) : null,
    type: provider.type,
  };
}

function chunkArray(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  requireFile(options.distJs, "Run npm run build:port first.");
  requireFile(options.distWasm, "Run npm run build:port first.");
  for (const sourceRel of trackedSources) {
    requireFile(resolve(repoRoot, sourceRel), "Tracked weak-stub source is missing.");
    requireFile(objectPathForSource(options.buildDir, sourceRel), "Run npm run build:port first.");
  }

  const queryOutput = run("ninja", ["-t", "query", options.distJs], { cwd: options.buildDir });
  const linkInputs = parseLinkInputs(queryOutput, options.buildDir).filter(existsSync);

  const declarationsBySource = new Map();
  const allDeclarations = [];
  for (const sourceRel of trackedSources) {
    const declarations = parseExplicitWeakDeclarations(sourceRel);
    declarationsBySource.set(sourceRel, declarations);
    allDeclarations.push(...declarations);
  }

  const objectWeakSymbols = [];
  const unmatchedWeakSymbols = [];
  for (const sourceRel of trackedSources) {
    const objectPath = objectPathForSource(options.buildDir, sourceRel);
    const nmOutput = run(
      "llvm-nm",
      ["--defined-only", "--no-demangle", "--line-numbers", objectPath],
      { cwd: repoRoot },
    );
    const weakSymbols = parseNmDefined(nmOutput).filter((symbol) => isWeakType(symbol.type));
    const demangled = demangle(weakSymbols.map((symbol) => symbol.symbol));
    const declarations = declarationsBySource.get(sourceRel) ?? [];

    for (const symbol of weakSymbols) {
      const enriched = {
        ...symbol,
        source: sourceRel,
        object: relative(repoRoot, objectPath),
        demangled: demangled.get(symbol.symbol) ?? symbol.symbol,
        sourceLine: sourceLineFromLocation(symbol.location),
        sourceFile: sourceFileFromLocation(symbol.location)
          ? relative(repoRoot, sourceFileFromLocation(symbol.location))
          : null,
      };
      const declaration = declarations.find((candidate) => declarationMatchesSymbol(candidate, enriched));
      if (declaration) {
        objectWeakSymbols.push({ ...enriched, declaration });
      } else {
        unmatchedWeakSymbols.push(enriched);
      }
    }
  }

  const compiledSymbolsByDeclaration = new Map();
  for (const symbol of objectWeakSymbols) {
    const key = `${symbol.declaration.source}:${symbol.declaration.line}:${symbol.declaration.asmSymbol ?? symbol.declaration.name}`;
    if (!compiledSymbolsByDeclaration.has(key)) {
      compiledSymbolsByDeclaration.set(key, []);
    }
    compiledSymbolsByDeclaration.get(key).push(symbol);
  }

  const finalSymbols = new Set(
    parseNmDefined(run("llvm-nm", ["--defined-only", "--no-demangle", options.distWasm]))
      .map((symbol) => symbol.symbol),
  );

  const targetSymbols = new Set(objectWeakSymbols.map((symbol) => symbol.symbol));
  const strongProvidersBySymbol = new Map();
  for (const chunk of chunkArray(linkInputs, 48)) {
    const nmOutput = run(
      "llvm-nm",
      ["--defined-only", "--no-demangle", "--print-file-name", ...chunk],
      { cwd: repoRoot },
    );
    for (const symbol of parseNmDefined(nmOutput)) {
      if (!targetSymbols.has(symbol.symbol) || !isStrongExternalType(symbol.type)) {
        continue;
      }
      if (!strongProvidersBySymbol.has(symbol.symbol)) {
        strongProvidersBySymbol.set(symbol.symbol, []);
      }
      strongProvidersBySymbol.get(symbol.symbol).push(symbol);
    }
  }

  const compiledWeakDefinitions = objectWeakSymbols.map((symbol) => {
    const providers = strongProvidersBySymbol.get(symbol.symbol) ?? [];
    const presentInFinal = finalSymbols.has(symbol.symbol);
    let status = "no-final-symbol-visible";
    if (providers.length > 0) {
      status = "strong-provider-overlap";
    } else if (presentInFinal) {
      status = "active-weak-boundary";
    }

    return {
      source: symbol.source,
      declarationLine: symbol.declaration.line,
      nmLine: symbol.sourceLine,
      symbol: symbol.symbol,
      demangled: symbol.demangled,
      type: symbol.type,
      presentInFinal,
      status,
      strongProviders: providers.map(compactProvider),
    };
  });

  const sourceWeakDeclarations = allDeclarations.map((declaration) => {
    const key = `${declaration.source}:${declaration.line}:${declaration.asmSymbol ?? declaration.name}`;
    const compiledSymbols = compiledSymbolsByDeclaration.get(key) ?? [];
    return {
      source: declaration.source,
      line: declaration.line,
      name: declaration.name,
      asmSymbol: declaration.asmSymbol,
      compiled: compiledSymbols.length > 0,
      compiledSymbols: compiledSymbols.map((symbol) => symbol.symbol),
    };
  });

  const bySource = {};
  for (const sourceRel of trackedSources) {
    const sourceDefinitions = compiledWeakDefinitions.filter((entry) => entry.source === sourceRel);
    const sourceDeclarations = sourceWeakDeclarations.filter((entry) => entry.source === sourceRel);
    bySource[sourceRel] = {
      sourceWeakDeclarations: sourceDeclarations.length,
      compiledWeakDefinitions: sourceDefinitions.length,
      gatedOutDeclarations: sourceDeclarations.filter((entry) => !entry.compiled).length,
      finalPresent: sourceDefinitions.filter((entry) => entry.presentInFinal).length,
      activeWeakBoundaries: sourceDefinitions.filter((entry) => entry.status === "active-weak-boundary").length,
      strongProviderOverlaps: sourceDefinitions.filter((entry) => entry.status === "strong-provider-overlap").length,
      noFinalSymbolVisible: sourceDefinitions.filter((entry) => entry.status === "no-final-symbol-visible").length,
      unmatchedCompiledWeakSymbols: unmatchedWeakSymbols.filter((entry) => entry.source === sourceRel).length,
    };
  }

  const strongProviderOverlaps = compiledWeakDefinitions.filter(
    (entry) => entry.status === "strong-provider-overlap",
  );
  const report = {
    ok: !(options.failOnOverlap && strongProviderOverlaps.length > 0),
    note:
      "strong-provider-overlap means the current link inputs contain a real strong definition with the same mangled name; without a wasm link map this report does not prove which body won.",
    buildDir: relative(repoRoot, options.buildDir),
    distWasm: relative(repoRoot, options.distWasm),
    linkInputs: linkInputs.length,
    summary: {
      sourceWeakDeclarations: sourceWeakDeclarations.length,
      compiledWeakDefinitions: compiledWeakDefinitions.length,
      gatedOutDeclarations: sourceWeakDeclarations.filter((entry) => !entry.compiled).length,
      finalPresent: compiledWeakDefinitions.filter((entry) => entry.presentInFinal).length,
      activeWeakBoundaries: compiledWeakDefinitions.filter((entry) => entry.status === "active-weak-boundary").length,
      strongProviderOverlaps: strongProviderOverlaps.length,
      noFinalSymbolVisible: compiledWeakDefinitions.filter((entry) => entry.status === "no-final-symbol-visible").length,
      unmatchedCompiledWeakSymbols: unmatchedWeakSymbols.length,
    },
    bySource,
    sourceWeakDeclarations,
    compiledWeakDefinitions,
    unmatchedCompiledWeakSymbolsSample: unmatchedWeakSymbols.slice(0, 30).map((symbol) => ({
      source: symbol.source,
      nmLine: symbol.sourceLine,
      symbol: symbol.symbol,
      demangled: symbol.demangled,
      type: symbol.type,
    })),
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) {
    process.exit(1);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
