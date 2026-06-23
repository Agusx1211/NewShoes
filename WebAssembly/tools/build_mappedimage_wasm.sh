#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
wasm_dir="$(cd "${script_dir}/.." && pwd)"
out_dir="${wasm_dir}/dist"
out_file="${out_dir}/generals_mappedimage.wasm"

mkdir -p "${out_dir}"

exports=(
  -Wl,--export=generals_mappedimage_input_ptr
  -Wl,--export=generals_mappedimage_input_capacity
  -Wl,--export=generals_mappedimage_parse
  -Wl,--export=generals_mappedimage_image_count
  -Wl,--export=generals_mappedimage_field_count
  -Wl,--export=generals_mappedimage_texture_assignment_count
  -Wl,--export=generals_mappedimage_rotated_count
  -Wl,--export=generals_mappedimage_raw_texture_count
  -Wl,--export=generals_mappedimage_none_status_count
  -Wl,--export=generals_mappedimage_line_count
  -Wl,--export=generals_mappedimage_error_count
  -Wl,--export=generals_mappedimage_name_ptr
  -Wl,--export=generals_mappedimage_name_size
  -Wl,--export=generals_mappedimage_texture_ptr
  -Wl,--export=generals_mappedimage_texture_size
  -Wl,--export=generals_mappedimage_status_raw_ptr
  -Wl,--export=generals_mappedimage_status_raw_size
  -Wl,--export=generals_mappedimage_line
  -Wl,--export=generals_mappedimage_field_count_at
  -Wl,--export=generals_mappedimage_texture_width
  -Wl,--export=generals_mappedimage_texture_height
  -Wl,--export=generals_mappedimage_left
  -Wl,--export=generals_mappedimage_top
  -Wl,--export=generals_mappedimage_right
  -Wl,--export=generals_mappedimage_bottom
  -Wl,--export=generals_mappedimage_image_width
  -Wl,--export=generals_mappedimage_image_height
  -Wl,--export=generals_mappedimage_status_mask
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
    "${wasm_dir}/src/mappedimage_module.cpp" \
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
    "${wasm_dir}/src/mappedimage_module.cpp" \
    -o "${out_file}"
fi

echo "Built ${out_file}"
