#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
wasm_dir="$(cd "${script_dir}/.." && pwd)"
out_dir="${wasm_dir}/dist"
out_file="${out_dir}/generals_campaign.wasm"

mkdir -p "${out_dir}"

exports=(
  -Wl,--export=generals_campaign_count
  -Wl,--export=generals_campaign_error_count
  -Wl,--export=generals_campaign_field_count
  -Wl,--export=generals_campaign_field_count_at
  -Wl,--export=generals_campaign_final_movie_ptr
  -Wl,--export=generals_campaign_final_movie_size
  -Wl,--export=generals_campaign_first_mission_index
  -Wl,--export=generals_campaign_first_mission_ptr
  -Wl,--export=generals_campaign_first_mission_size
  -Wl,--export=generals_campaign_input_capacity
  -Wl,--export=generals_campaign_input_ptr
  -Wl,--export=generals_campaign_is_challenge
  -Wl,--export=generals_campaign_line
  -Wl,--export=generals_campaign_line_count
  -Wl,--export=generals_campaign_mission_campaign_index
  -Wl,--export=generals_campaign_mission_count
  -Wl,--export=generals_campaign_mission_field_count_at
  -Wl,--export=generals_campaign_mission_general_name_ptr
  -Wl,--export=generals_campaign_mission_general_name_size
  -Wl,--export=generals_campaign_mission_intro_movie_ptr
  -Wl,--export=generals_campaign_mission_intro_movie_size
  -Wl,--export=generals_campaign_mission_line
  -Wl,--export=generals_campaign_mission_location_label_ptr
  -Wl,--export=generals_campaign_mission_location_label_size
  -Wl,--export=generals_campaign_mission_map_ptr
  -Wl,--export=generals_campaign_mission_map_size
  -Wl,--export=generals_campaign_mission_name_ptr
  -Wl,--export=generals_campaign_mission_name_size
  -Wl,--export=generals_campaign_mission_next_ptr
  -Wl,--export=generals_campaign_mission_next_size
  -Wl,--export=generals_campaign_mission_objective0_ptr
  -Wl,--export=generals_campaign_mission_objective0_size
  -Wl,--export=generals_campaign_mission_total
  -Wl,--export=generals_campaign_mission_voice_length
  -Wl,--export=generals_campaign_name_label_ptr
  -Wl,--export=generals_campaign_name_label_size
  -Wl,--export=generals_campaign_name_ptr
  -Wl,--export=generals_campaign_name_size
  -Wl,--export=generals_campaign_parse
  -Wl,--export=generals_campaign_player_faction_ptr
  -Wl,--export=generals_campaign_player_faction_size
)

if command -v em++ >/dev/null 2>&1 && [[ "${GENERALS_WASM_FORCE_RAW_CLANG:-0}" != "1" ]]; then
  em++ \
    -std=c++17 -O2 -fno-exceptions -fno-rtti --no-entry \
    -sSTANDALONE_WASM=1 -sINITIAL_MEMORY=16777216 \
    "${exports[@]}" \
    "${wasm_dir}/src/campaign_module.cpp" -o "${out_file}"
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
    "${wasm_dir}/src/campaign_module.cpp" -o "${out_file}"
fi

echo "Built ${out_file}"
