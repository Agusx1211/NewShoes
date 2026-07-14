#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const decoderRoot = join(wasmRoot, "bink-decoder");
const MAX_DECODER_BYTES = 128 * 1024;
const UPSTREAM_REVISION = "a9a01212fe7104417246ff6ca922319f5f3f859b";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function buildBinkDecoderRuntime(outputRoot) {
  const rustSysroot = execFileSync("rustc", ["--print", "sysroot"], {
    cwd: decoderRoot,
    encoding: "utf8",
  }).trim();
  const rustFlags = [
    `--remap-path-prefix=${decoderRoot}=WebAssembly/bink-decoder`,
    `--remap-path-prefix=${wasmRoot}=WebAssembly`,
    `--remap-path-prefix=${resolve(wasmRoot, "..")}=.`,
    ...(process.env.HOME ? [`--remap-path-prefix=${process.env.HOME}=~`] : []),
    ...(rustSysroot ? [`--remap-path-prefix=${rustSysroot}=rust-toolchain`] : []),
  ].join(" ");
  execFileSync("cargo", [
    "build",
    "--manifest-path", join(decoderRoot, "Cargo.toml"),
    "--target", "wasm32-unknown-unknown",
    "--release",
    "--locked",
    "--lib",
  ], {
    cwd: decoderRoot,
    stdio: "inherit",
    env: { ...process.env, RUSTFLAGS: rustFlags },
  });

  const wasm = await readFile(join(
    decoderRoot,
    "target/wasm32-unknown-unknown/release/cnc_bink_decoder.wasm",
  ));
  if (wasm.byteLength <= 0 || wasm.byteLength > MAX_DECODER_BYTES) {
    throw new Error(
      `Compact Bink decoder is ${wasm.byteLength} bytes; size gate is ${MAX_DECODER_BYTES}`,
    );
  }
  const runtimeRoot = join(resolve(outputRoot), "video-runtime");
  await mkdir(runtimeRoot, { recursive: true });
  await writeFile(join(runtimeRoot, "bink-decoder.wasm"), wasm);
  const manifest = {
    schema: "cnc-zh-bink-decoder-runtime/v1",
    abiVersion: 1,
    wasmFile: "bink-decoder.wasm",
    wasmBytes: wasm.byteLength,
    wasmSha256: sha256(wasm),
    maxWasmBytes: MAX_DECODER_BYTES,
    supportedSignatures: ["BIKb", "BIKf", "BIKg", "BIKh", "BIKi", "BIKk"],
    upstreamRevision: UPSTREAM_REVISION,
  };
  await writeFile(
    join(runtimeRoot, "bink-decoder-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  const sourceNotice = [
    "Project New Shoes compact Bink Video v1 decoder",
    "License: GNU GPL version 3 or later",
    `Derived from infinitier_bik_decoder revision ${UPSTREAM_REVISION}`,
    `Upstream source: https://github.com/ufoscout/infinitier/tree/${UPSTREAM_REVISION}/src/codecs/bik_decoder`,
    "Modified source: WebAssembly/bink-decoder in the corresponding Project New Shoes source tree",
    "Changes: removed unrelated workspace/WAV/helper dependencies; added the focused browser ABI and BGRA output.",
    "This standalone module is fetched only when an installed classic-Bink movie is opened.",
    "",
  ].join("\n");
  await writeFile(join(runtimeRoot, "bink-decoder-SOURCE.txt"), sourceNotice);
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputRoot = resolve(process.argv[2] || join(wasmRoot, "artifacts/bink-decoder-runtime"));
  const manifest = await buildBinkDecoderRuntime(outputRoot);
  console.log(JSON.stringify({ outputRoot, ...manifest }, null, 2));
}
