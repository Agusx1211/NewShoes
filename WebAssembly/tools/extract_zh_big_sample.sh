#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
wasm_dir="$(cd "${script_dir}/.." && pwd)"
repo_root="$(cd "${wasm_dir}/.." && pwd)"
disc_image="${1:-${repo_root}/assets/Command & Conquer - Generals - Zero Hour (USA) (Disc 2).bin}"
out_dir="${wasm_dir}/artifacts/real-assets"
iso_image="${out_dir}/Disc2.iso"

if ! command -v 7z >/dev/null 2>&1; then
  echo "7z is required to extract the BIG sample from the install image." >&2
  exit 1
fi

if [[ ! -f "${disc_image}" ]]; then
  echo "Disc image not found: ${disc_image}" >&2
  exit 1
fi

mkdir -p "${out_dir}"
if [[ ! -f "${iso_image}" || "${disc_image}" -nt "${iso_image}" ]]; then
  node "${script_dir}/mode1_2352_to_iso.mjs" "${disc_image}" "${iso_image}" >/dev/null
fi

7z e -y "-o${out_dir}" "${iso_image}" Gensec.big >/dev/null

echo "${out_dir}/Gensec.big"
