#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
wasm_dir="$(cd "${script_dir}/.." && pwd)"
out_dir="${wasm_dir}/dist"
out_file="${out_dir}/generals_miscaudio.wasm"

mkdir -p "${out_dir}"

exports=(
  -Wl,--export=generals_miscaudio_input_ptr
  -Wl,--export=generals_miscaudio_input_capacity
  -Wl,--export=generals_miscaudio_parse
  -Wl,--export=generals_miscaudio_slot_count
  -Wl,--export=generals_miscaudio_field_count
  -Wl,--export=generals_miscaudio_assigned_count
  -Wl,--export=generals_miscaudio_event_count
  -Wl,--export=generals_miscaudio_no_sound_count
  -Wl,--export=generals_miscaudio_missing_count
  -Wl,--export=generals_miscaudio_line_count
  -Wl,--export=generals_miscaudio_error_count
  -Wl,--export=generals_miscaudio_slot_field_ptr
  -Wl,--export=generals_miscaudio_slot_field_size
  -Wl,--export=generals_miscaudio_slot_event_ptr
  -Wl,--export=generals_miscaudio_slot_event_size
  -Wl,--export=generals_miscaudio_slot_line
  -Wl,--export=generals_miscaudio_slot_assigned
  -Wl,--export=generals_miscaudio_slot_has_event
  -Wl,--export=generals_miscaudio_slot_no_sound
)

if command -v em++ >/dev/null 2>&1 && [[ "${GENERALS_WASM_FORCE_RAW_CLANG:-0}" != "1" ]]; then
  em++ \
    -std=c++17 \
    -O2 \
    -fno-exceptions \
    -fno-rtti \
    --no-entry \
    -sSTANDALONE_WASM=1 \
    -sINITIAL_MEMORY=16777216 \
    "${exports[@]}" \
    "${wasm_dir}/src/miscaudio_module.cpp" \
    -o "${out_file}"
else
  compiler="${CXX:-clang++}"

  if ! command -v "${compiler}" >/dev/null 2>&1; then
    echo "C++ compiler not found: ${compiler}" >&2
    exit 1
  fi

  "${compiler}" \
    --target=wasm32-unknown-unknown \
    -std=c++17 \
    -O2 \
    -fno-exceptions \
    -fno-rtti \
    -nostdlib \
    -Wl,--no-entry \
    -Wl,--export-memory \
    "${exports[@]}" \
    -Wl,--initial-memory=16777216 \
    -Wl,--max-memory=16777216 \
    "${wasm_dir}/src/miscaudio_module.cpp" \
    -o "${out_file}"
fi

echo "Built ${out_file}"
