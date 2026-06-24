#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
wasm_dir="$(cd "${script_dir}/.." && pwd)"
out_dir="${wasm_dir}/dist"
out_file="${out_dir}/generals_transition.wasm"

mkdir -p "${out_dir}"

exports=(
  -Wl,--export=generals_transition_count
  -Wl,--export=generals_transition_error_count
  -Wl,--export=generals_transition_field_count
  -Wl,--export=generals_transition_field_count_at
  -Wl,--export=generals_transition_fire_once
  -Wl,--export=generals_transition_first_window
  -Wl,--export=generals_transition_input_capacity
  -Wl,--export=generals_transition_input_ptr
  -Wl,--export=generals_transition_line
  -Wl,--export=generals_transition_line_count
  -Wl,--export=generals_transition_name_ptr
  -Wl,--export=generals_transition_name_size
  -Wl,--export=generals_transition_parse
  -Wl,--export=generals_transition_style_count
  -Wl,--export=generals_transition_style_name_ptr
  -Wl,--export=generals_transition_style_name_size
  -Wl,--export=generals_transition_window_count
  -Wl,--export=generals_transition_window_field_count_at
  -Wl,--export=generals_transition_window_frame_delay
  -Wl,--export=generals_transition_window_group_index
  -Wl,--export=generals_transition_window_line
  -Wl,--export=generals_transition_window_name_ptr
  -Wl,--export=generals_transition_window_name_size
  -Wl,--export=generals_transition_window_style
  -Wl,--export=generals_transition_window_style_name_ptr
  -Wl,--export=generals_transition_window_style_name_size
  -Wl,--export=generals_transition_window_total
)

if command -v em++ >/dev/null 2>&1 && [[ "${GENERALS_WASM_FORCE_RAW_CLANG:-0}" != "1" ]]; then
  em++ \
    -std=c++17 -O2 -fno-exceptions -fno-rtti --no-entry \
    -sSTANDALONE_WASM=1 -sINITIAL_MEMORY=16777216 \
    "${exports[@]}" \
    "${wasm_dir}/src/transition_module.cpp" -o "${out_file}"
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
    "${wasm_dir}/src/transition_module.cpp" -o "${out_file}"
fi

echo "Built ${out_file}"
