#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
wasm_dir="$(cd "${script_dir}/.." && pwd)"
out_dir="${wasm_dir}/dist"
out_file="${out_dir}/generals_challenge.wasm"

mkdir -p "${out_dir}"

exports=(
  -Wl,--export=generals_challenge_bio_name_ptr
  -Wl,--export=generals_challenge_bio_name_size
  -Wl,--export=generals_challenge_bio_rank_ptr
  -Wl,--export=generals_challenge_bio_rank_size
  -Wl,--export=generals_challenge_bio_strategy_ptr
  -Wl,--export=generals_challenge_bio_strategy_size
  -Wl,--export=generals_challenge_campaign_ptr
  -Wl,--export=generals_challenge_campaign_size
  -Wl,--export=generals_challenge_count
  -Wl,--export=generals_challenge_enabled_count
  -Wl,--export=generals_challenge_error_count
  -Wl,--export=generals_challenge_field_count
  -Wl,--export=generals_challenge_field_count_at
  -Wl,--export=generals_challenge_has_block
  -Wl,--export=generals_challenge_input_capacity
  -Wl,--export=generals_challenge_input_ptr
  -Wl,--export=generals_challenge_line
  -Wl,--export=generals_challenge_line_count
  -Wl,--export=generals_challenge_parse
  -Wl,--export=generals_challenge_player_template_ptr
  -Wl,--export=generals_challenge_player_template_size
  -Wl,--export=generals_challenge_portrait_large_ptr
  -Wl,--export=generals_challenge_portrait_large_size
  -Wl,--export=generals_challenge_position
  -Wl,--export=generals_challenge_selection_sound_ptr
  -Wl,--export=generals_challenge_selection_sound_size
  -Wl,--export=generals_challenge_starts_enabled
)

if command -v em++ >/dev/null 2>&1 && [[ "${GENERALS_WASM_FORCE_RAW_CLANG:-0}" != "1" ]]; then
  em++ \
    -std=c++17 -O2 -fno-exceptions -fno-rtti --no-entry \
    -sSTANDALONE_WASM=1 -sINITIAL_MEMORY=16777216 \
    "${exports[@]}" \
    "${wasm_dir}/src/challenge_module.cpp" -o "${out_file}"
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
    "${wasm_dir}/src/challenge_module.cpp" -o "${out_file}"
fi

echo "Built ${out_file}"
