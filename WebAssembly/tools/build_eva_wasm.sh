#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
wasm_dir="$(cd "${script_dir}/.." && pwd)"
out_dir="${wasm_dir}/dist"
out_file="${out_dir}/generals_eva.wasm"

mkdir -p "${out_dir}"

exports=(
  -Wl,--export=generals_eva_count
  -Wl,--export=generals_eva_error_count
  -Wl,--export=generals_eva_expiration_time_ms
  -Wl,--export=generals_eva_field_count
  -Wl,--export=generals_eva_field_count_at
  -Wl,--export=generals_eva_first_side_sound
  -Wl,--export=generals_eva_input_capacity
  -Wl,--export=generals_eva_input_ptr
  -Wl,--export=generals_eva_line
  -Wl,--export=generals_eva_line_count
  -Wl,--export=generals_eva_name_ptr
  -Wl,--export=generals_eva_name_size
  -Wl,--export=generals_eva_parse
  -Wl,--export=generals_eva_priority
  -Wl,--export=generals_eva_side_sound_count_at
  -Wl,--export=generals_eva_side_sound_event_index
  -Wl,--export=generals_eva_side_sound_first_sound_ptr
  -Wl,--export=generals_eva_side_sound_first_sound_size
  -Wl,--export=generals_eva_side_sound_line
  -Wl,--export=generals_eva_side_sounds_count
  -Wl,--export=generals_eva_side_sound_side_ptr
  -Wl,--export=generals_eva_side_sound_side_size
  -Wl,--export=generals_eva_side_sounds_total
  -Wl,--export=generals_eva_time_between_checks_ms
)

if command -v em++ >/dev/null 2>&1 && [[ "${GENERALS_WASM_FORCE_RAW_CLANG:-0}" != "1" ]]; then
  em++ \
    -std=c++17 -O2 -fno-exceptions -fno-rtti --no-entry \
    -sSTANDALONE_WASM=1 -sINITIAL_MEMORY=16777216 \
    "${exports[@]}" \
    "${wasm_dir}/src/eva_module.cpp" -o "${out_file}"
else
  compiler="${CXX:-clang++}"
  if ! command -v "${compiler}" >/dev/null 2>&1; then
    echo "C++ compiler not found: ${compiler}" >&2
    exit 1
  fi
  "${compiler}" \
    --target=wasm32-unknown-unknown -std=c++17 -O2 -fno-exceptions -fno-rtti -nostdlib \
    -Wl,--no-entry -Wl,--export-memory "${exports[@]}" \
    -Wl,--initial-memory=16777216 -Wl,--max-memory=16777216 \
    "${wasm_dir}/src/eva_module.cpp" -o "${out_file}"
fi

echo "Built ${out_file}"
