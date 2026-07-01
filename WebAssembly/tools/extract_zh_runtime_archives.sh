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
base_work_dir="${out_dir}/base-generals"
base_disc1_iso="${base_work_dir}/Disc1.iso"
base_disc2_iso="${base_work_dir}/Disc2.iso"
base_data_cab="${base_work_dir}/Data1.cab"
base_language_cab="${base_work_dir}/Language.cab"

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

loose_video_payloads=(
  GC_Background.bik
  VS_small.bik
)

base_data_archives=(
  INI.big
  Terrain.big
  Textures.big
  Window.big
)

base_language_archives=(
  English.big
)

extracted_optional_archives=()

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

find_optional_base_disc() {
  local disc_number="$1"
  local override_path="$2"

  if [[ -n "${override_path}" ]]; then
    if [[ ! -f "${override_path}" ]]; then
      echo "Configured base Generals disc ${disc_number} image not found: ${override_path}" >&2
      exit 1
    fi
    printf '%s\n' "${override_path}"
    return
  fi

  local -a candidates=()
  if [[ -d "${repo_root}/assets" ]]; then
    while IFS= read -r -d '' candidate; do
      candidates+=("${candidate}")
    done < <(find "${repo_root}/assets" -maxdepth 1 -type f \
      -iname "*Generals*Disc ${disc_number}*.bin" \
      ! -iname "*Zero Hour*" \
      -print0 | sort -z)
  fi

  if (( ${#candidates[@]} > 0 )); then
    if (( ${#candidates[@]} > 1 )); then
      echo "Multiple base Generals disc ${disc_number} candidates found; using ${candidates[0]}" >&2
    fi
    printf '%s\n' "${candidates[0]}"
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

require_bink() {
  local video_path="$1"

  if [[ ! -s "${video_path}" ]]; then
    echo "Bink video missing or empty: ${video_path}" >&2
    exit 1
  fi

  local magic
  magic="$(head -c 3 "${video_path}")"
  if [[ "${magic}" != "BIK" && "${magic}" != "KB2" ]]; then
    echo "Bink video has unexpected header: ${video_path}" >&2
    exit 1
  fi
}

record_optional_archive_if_present() {
  local archive="$1"
  local archive_path="${out_dir}/${archive}"

  if [[ ! -e "${archive_path}" ]]; then
    return 1
  fi

  require_big "${archive_path}"
  local existing_archive
  for existing_archive in "${extracted_optional_archives[@]}"; do
    if [[ "${existing_archive}" == "${archive}" ]]; then
      return 0
    fi
  done
  extracted_optional_archives+=("${archive}")
  return 0
}

extract_optional_base_startup_archives() {
  local base_disc1_image
  local base_disc2_image

  base_disc1_image="$(find_optional_base_disc 1 "${CNC_GENERALS_DISC1_IMAGE:-}")"
  base_disc2_image="$(find_optional_base_disc 2 "${CNC_GENERALS_DISC2_IMAGE:-}")"

  if [[ -z "${base_disc1_image}" && -z "${base_disc2_image}" ]]; then
    local found_existing=false
    local archive
    for archive in "${base_data_archives[@]}" "${base_language_archives[@]}"; do
      if record_optional_archive_if_present "${archive}"; then
        found_existing=true
      fi
    done

    if [[ "${found_existing}" == true ]]; then
      echo "Optional base Generals disc images not found; keeping existing base Generals BIG artifacts." >&2
    else
      echo "Optional base Generals disc images not found; skipping base Generals BIG extraction." >&2
    fi
    return
  fi

  mkdir -p "${base_work_dir}"

  if [[ -n "${base_disc1_image}" ]]; then
    ensure_iso "${base_disc1_image}" "${base_disc1_iso}"
    7z e -y "-o${base_work_dir}" "${base_disc1_iso}" Data1.cab >/dev/null
    7z e -y "-o${out_dir}" "${base_data_cab}" "${base_data_archives[@]}" >/dev/null
    for archive in "${base_data_archives[@]}"; do
      record_optional_archive_if_present "${archive}"
    done
  else
    local archive
    for archive in "${base_data_archives[@]}"; do
      if ! record_optional_archive_if_present "${archive}"; then
        echo "Optional base Generals disc 1 image not found; ${archive} was not extracted." >&2
      fi
    done
  fi

  if [[ -n "${base_disc2_image}" ]]; then
    ensure_iso "${base_disc2_image}" "${base_disc2_iso}"
    7z e -y "-o${base_work_dir}" "${base_disc2_iso}" Language.cab >/dev/null
    7z e -y "-o${out_dir}" "${base_language_cab}" "${base_language_archives[@]}" >/dev/null
    for archive in "${base_language_archives[@]}"; do
      record_optional_archive_if_present "${archive}"
    done
  elif ! record_optional_archive_if_present "English.big"; then
    echo "Optional base Generals disc 2 image not found; English.big was not extracted." >&2
  fi
}

mkdir -p "${out_dir}"
ensure_iso "${disc1_image}" "${disc1_iso}"
ensure_iso "${disc2_image}" "${disc2_iso}"

7z e -y "-o${out_dir}" "${disc1_iso}" Data1.cab GensecZH.big >/dev/null
7z e -y "-o${out_dir}" "${disc2_iso}" Language.cab Gensec.big >/dev/null
7z e -y "-o${out_dir}" "${data_cab}" "${data_archives[@]}" >/dev/null
7z e -y "-o${out_dir}" "${data_cab}" "${loose_video_payloads[@]}" >/dev/null
7z e -y "-o${out_dir}" "${language_cab}" "${language_archives[@]}" >/dev/null

for archive in "${data_archives[@]}" "${language_archives[@]}" "${top_level_archives[@]}"; do
  require_big "${out_dir}/${archive}"
done

for video in "${loose_video_payloads[@]}"; do
  require_bink "${out_dir}/${video}"
done

extract_optional_base_startup_archives

printf '%s\n' \
  "${data_archives[@]}" \
  "${language_archives[@]}" \
  "${top_level_archives[@]}" \
  "${loose_video_payloads[@]}" \
  "${extracted_optional_archives[@]}" | sort -u
