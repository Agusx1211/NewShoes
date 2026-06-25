#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
wasm_dir="$(cd "${script_dir}/.." && pwd)"
repo_root="$(cd "${wasm_dir}/.." && pwd)"
out_dir="${wasm_dir}/artifacts/real-assets"

disc1_image="${repo_root}/assets/Command & Conquer - Generals - Zero Hour (USA) (Disc 1).bin"
disc2_image="${repo_root}/assets/Command & Conquer - Generals - Zero Hour (USA) (Disc 2).bin"
disc1_iso="${out_dir}/Disc1.iso"
disc2_iso="${out_dir}/Disc2.iso"
data_cab="${out_dir}/Data1.cab"
language_cab="${out_dir}/Language.cab"

data_archives=(
  AudioZH.big
  GensecZH.big
  INIZH.big
  MapsZH.big
  Music.big
  MusicZH.big
  ShadersZH.big
  SpeechZH.big
  TerrainZH.big
  TexturesZH.big
  W3DZH.big
  WindowZH.big
)

language_archives=(
  AudioEnglishZH.big
  EnglishZH.big
  SpeechEnglishZH.big
  W3DEnglishZH.big
)

top_level_archives=(
  Gensec.big
  GensecZH.big
)

if ! command -v 7z >/dev/null 2>&1; then
  echo "7z is required to extract the runtime archives." >&2
  exit 1
fi

ensure_iso() {
  local source_image="$1"
  local iso_image="$2"

  if [[ ! -f "${source_image}" ]]; then
    echo "Disc image not found: ${source_image}" >&2
    exit 1
  fi

  if [[ ! -f "${iso_image}" || "${source_image}" -nt "${iso_image}" ]]; then
    node "${script_dir}/mode1_2352_to_iso.mjs" "${source_image}" "${iso_image}" >/dev/null
  fi
}

require_big() {
  local archive_path="$1"

  if [[ ! -s "${archive_path}" ]]; then
    echo "Archive missing or empty: ${archive_path}" >&2
    exit 1
  fi

  if [[ "$(head -c 4 "${archive_path}")" != "BIGF" ]]; then
    echo "Archive does not have BIGF header: ${archive_path}" >&2
    exit 1
  fi
}

mkdir -p "${out_dir}"
ensure_iso "${disc1_image}" "${disc1_iso}"
ensure_iso "${disc2_image}" "${disc2_iso}"

7z e -y "-o${out_dir}" "${disc1_iso}" Data1.cab GensecZH.big >/dev/null
7z e -y "-o${out_dir}" "${disc2_iso}" Language.cab Gensec.big >/dev/null
7z e -y "-o${out_dir}" "${data_cab}" "${data_archives[@]}" >/dev/null
7z e -y "-o${out_dir}" "${language_cab}" "${language_archives[@]}" >/dev/null

for archive in "${data_archives[@]}" "${language_archives[@]}" "${top_level_archives[@]}"; do
  require_big "${out_dir}/${archive}"
done

printf '%s\n' "${data_archives[@]}" "${language_archives[@]}" "${top_level_archives[@]}" | sort -u
