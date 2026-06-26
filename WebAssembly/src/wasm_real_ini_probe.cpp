#include "wasm_real_ini_probe.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <iterator>
#include <string>
#include <vector>

#include "PreRTS.h"

#include "Common/ArchiveFileSystem.h"
#include "Common/AcademyStats.h"
#include "Common/AudioEventRTS.h"
#include "Common/DamageFX.h"
#include "Common/File.h"
#include "Common/FileSystem.h"
#include "Common/GameMemory.h"
#include "Common/GlobalData.h"
#include "Common/INI.h"
#include "Common/LocalFileSystem.h"
#include "Common/MultiplayerSettings.h"
#include "Common/NameKeyGenerator.h"
#include "Common/PlayerTemplate.h"
#include "Common/Science.h"
#include "Common/SpecialPower.h"
#include "Common/TerrainTypes.h"
#include "Common/Upgrade.h"
#include "Common/WellKnownKeys.h"
#include "GameClient/ControlBar.h"
#include "GameClient/ControlBarScheme.h"
#include "GameClient/DrawGroupInfo.h"
#include "GameClient/FXList.h"
#include "GameClient/GameText.h"
#include "GameClient/Image.h"
#include "GameClient/MapUtil.h"
#include "GameClient/ParticleSys.h"
#include "GameClient/Snow.h"
#include "GameClient/TerrainRoads.h"
#include "GameClient/VideoPlayer.h"
#include "GameClient/Water.h"
#include "GameNetwork/GameSpy/PeerDefs.h"
#ifdef AI_PASSIVE
#undef AI_PASSIVE
#endif
#include "GameLogic/AI.h"
#include "GameLogic/Armor.h"
#include "GameLogic/CrateSystem.h"
#include "GameLogic/Damage.h"
#include "GameLogic/Locomotor.h"
#include "GameLogic/SidesList.h"
#include "GameLogic/Weapon.h"
#include "Win32Device/Common/Win32BIGFileSystem.h"
#include "Win32Device/Common/Win32LocalFileSystem.h"

class TerrainVisual;

MapCache *TheMapCache __attribute__((weak)) = nullptr;
TerrainVisual *TheTerrainVisual __attribute__((weak)) = nullptr;
const StaticNameKey TheKey_InitialCameraPosition __attribute__((weak))("InitialCameraPosition");

namespace {
constexpr const char ARMOR_INI_PATH[] = "Data\\INI\\Armor.ini";
constexpr const char DAMAGE_FX_INI_PATH[] = "Data\\INI\\DamageFX.ini";
constexpr const char PARTICLE_SYSTEM_INI_PATH[] = "Data\\INI\\ParticleSystem.ini";
constexpr const char WEAPON_INI_PATH[] = "Data\\INI\\Weapon.ini";
constexpr const char DEFAULT_AI_DATA_INI_PATH[] = "Data\\INI\\Default\\AIData.ini";
constexpr const char AI_DATA_INI_PATH[] = "Data\\INI\\AIData.ini";
constexpr const char LOCOMOTOR_INI_PATH[] = "Data\\INI\\Locomotor.ini";
constexpr const char GAME_DATA_INI_PATH[] = "Data\\INI\\GameData.ini";
constexpr const char SCIENCE_INI_PATH[] = "Data\\INI\\Science.ini";
constexpr const char SPECIAL_POWER_INI_PATH[] = "Data\\INI\\SpecialPower.ini";
constexpr const char FX_LIST_INI_PATH[] = "Data\\INI\\FXList.ini";
constexpr const char PLAYER_TEMPLATE_INI_PATH[] = "Data\\INI\\PlayerTemplate.ini";
constexpr const char COMMAND_BUTTON_INI_PATH[] = "Data\\INI\\CommandButton.ini";
constexpr const char COMMAND_SET_INI_PATH[] = "Data\\INI\\CommandSet.ini";
constexpr const char CONTROL_BAR_SCHEME_INI_PATH[] = "Data\\INI\\ControlBarScheme.ini";
constexpr const char DEFAULT_CONTROL_BAR_SCHEME_INI_PATH[] =
	"Data\\INI\\Default\\ControlBarScheme.ini";
constexpr const char CRATE_INI_PATH[] = "Data\\INI\\Crate.ini";
constexpr const char MULTIPLAYER_INI_PATH[] = "Data\\INI\\multiplayer.ini";
constexpr const char TERRAIN_INI_PATH[] = "Data\\INI\\Terrain.ini";
constexpr const char ROADS_INI_PATH[] = "Data\\INI\\Roads.ini";
constexpr const char DRAW_GROUP_INFO_INI_PATH[] = "Data\\INI\\DrawGroupInfo.ini";
constexpr const char MAPPED_IMAGES_DIR[] = "Data\\INI\\MappedImages";
constexpr const char MAPPED_IMAGES_SAMPLE_INI_PATH[] =
	"Data\\INI\\MappedImages\\TextureSize_512\\SAUserInterface512.INI";
constexpr const char UPGRADE_INI_PATH[] = "Data\\INI\\Upgrade.ini";
constexpr const char MAP_CACHE_INI_PATH[] = "Maps\\MapCache.ini";
constexpr const char DEFAULT_VIDEO_INI_PATH[] = "Data\\INI\\Default\\Video.ini";
constexpr const char VIDEO_INI_PATH[] = "Data\\INI\\Video.ini";
constexpr const char WATER_INI_PATH[] = "Data\\INI\\Water.ini";
constexpr const char WEATHER_INI_PATH[] = "Data\\INI\\Weather.ini";
constexpr const char EXPECTED_SHELL_MAP_NAME[] = "Maps\\ShellMapMD\\ShellMapMD.map";
constexpr const char SHELL_MAP_MD_PATH[] = "maps\\shellmapmd\\shellmapmd.map";
constexpr const char TOURNAMENT_DESERT_PATH[] = "maps\\tournament desert\\tournament desert.map";
constexpr const char SPECIAL_POWER_PROBE_INI_PATH[] = "__wasm_command_button_special_power_probe.ini";
constexpr const char COMMAND_BUTTON_PROBE_INI_PATH[] = "__wasm_command_button_probe.ini";
constexpr const char COMMAND_SET_PROBE_INI_PATH[] = "__wasm_command_set_probe.ini";
constexpr const char CRATE_PROBE_INI_PATH[] = "__wasm_crate_probe.ini";

class ProbeParticleSystemManager final : public ParticleSystemManager
{
public:
	Int getOnScreenParticleCount(void) override { return 0; }
	void doParticles(RenderInfoClass &) override {}
	void queueParticleRender() override {}
};

void split_archive_path(const char *archive_path, AsciiString &directory, AsciiString &file_mask)
{
	std::string normalized = archive_path != nullptr ? archive_path : "";
	std::replace(normalized.begin(), normalized.end(), '\\', '/');

	const std::size_t slash = normalized.find_last_of('/');
	if (slash == std::string::npos) {
		directory = "";
		file_mask = normalized.c_str();
		return;
	}

	directory = normalized.substr(0, slash + 1).c_str();
	file_mask = normalized.substr(slash + 1).c_str();
}

std::string trim_ascii(std::string value)
{
	const std::size_t first = value.find_first_not_of(" \t\r\n");
	if (first == std::string::npos) {
		return "";
	}

	const std::size_t last = value.find_last_not_of(" \t\r\n");
	return value.substr(first, last - first + 1);
}

std::size_t line_content_end(const std::string &text, std::size_t line_start, std::size_t line_end)
{
	while (line_end > line_start &&
			(text[line_end - 1] == '\n' || text[line_end - 1] == '\r')) {
		--line_end;
	}
	return line_end;
}

std::size_t next_line_start(const std::string &text, std::size_t line_start)
{
	const std::size_t newline = text.find('\n', line_start);
	return newline == std::string::npos ? text.size() : newline + 1;
}

bool read_archive_text(FileSystem &file_system, const char *path, std::string &text)
{
	FileInfo file_info = {};
	if (!file_system.getFileInfo(AsciiString(path), &file_info) ||
			file_info.sizeHigh != 0 ||
			file_info.sizeLow <= 0) {
		return false;
	}

	File *file = file_system.openFile(path, File::READ | File::BINARY);
	if (file == nullptr) {
		return false;
	}

	std::vector<char> bytes(static_cast<std::size_t>(file_info.sizeLow));
	const Int bytes_read = file->read(bytes.data(), file_info.sizeLow);
	file->close();
	if (bytes_read != file_info.sizeLow) {
		return false;
	}

	text.assign(bytes.begin(), bytes.end());
	return true;
}

bool append_ini_block(
	const std::string &source,
	const char *block_type,
	const char *button_name,
	std::string &destination)
{
	const std::string header = std::string(block_type) + " " + button_name;

	for (std::size_t line_start = 0; line_start < source.size();
			line_start = next_line_start(source, line_start)) {
		const std::size_t line_end = next_line_start(source, line_start);
		const std::size_t content_end = line_content_end(source, line_start, line_end);
		if (source.compare(line_start, content_end - line_start, header) != 0) {
			continue;
		}

		std::size_t block_end = line_end;
		for (std::size_t block_line_start = line_end; block_line_start < source.size();
				block_line_start = next_line_start(source, block_line_start)) {
			const std::size_t block_line_end = next_line_start(source, block_line_start);
			const std::size_t block_content_end =
				line_content_end(source, block_line_start, block_line_end);
			const std::string line =
				source.substr(block_line_start, block_content_end - block_line_start);
			block_end = block_line_end;
			if (trim_ascii(line) == "End") {
				break;
			}
		}

		destination.append(source, line_start, block_end - line_start);
		if (destination.empty() || destination.back() != '\n') {
			destination.push_back('\n');
		}
		destination.push_back('\n');
		return true;
	}

	return false;
}

bool append_command_button_block(
	const std::string &source,
	const char *button_name,
	std::string &destination)
{
	return append_ini_block(source, "CommandButton", button_name, destination);
}

bool append_command_set_block(
	const std::string &source,
	const char *set_name,
	std::string &destination)
{
	return append_ini_block(source, "CommandSet", set_name, destination);
}

bool append_crate_data_block(
	const std::string &source,
	const char *crate_name,
	std::string &destination)
{
	return append_ini_block(source, "CrateData", crate_name, destination);
}

bool write_probe_ini_file(const char *path, const std::string &text)
{
	if (TheFileSystem == nullptr) {
		return false;
	}

	File *file = TheFileSystem->openFile(
		path,
		File::WRITE | File::CREATE | File::TRUNCATE | File::BINARY);
	if (file == nullptr) {
		return false;
	}

	const Int bytes_written = file->write(text.data(), static_cast<Int>(text.size()));
	file->close();
	return bytes_written == static_cast<Int>(text.size());
}

bool write_probe_ini_file(const std::string &text)
{
	return write_probe_ini_file(COMMAND_BUTTON_PROBE_INI_PATH, text);
}

const crateCreationEntry *crate_entry_at(const CrateTemplate *crate, std::size_t index)
{
	if (crate == nullptr || index >= crate->m_possibleCrates.size()) {
		return nullptr;
	}

	crateCreationEntryConstIterator it = crate->m_possibleCrates.begin();
	std::advance(it, static_cast<crateCreationEntryList::difference_type>(index));
	return &(*it);
}

void inspect_crate_entry(
	const CrateTemplate *crate,
	std::size_t index,
	std::string &name,
	float &chance)
{
	const crateCreationEntry *entry = crate_entry_at(crate, index);
	if (entry != nullptr) {
		name = entry->crateName.str();
		chance = entry->crateChance;
	}
}

const AISideInfo *find_ai_side_info(const TAiData *data, const char *side)
{
	for (const AISideInfo *info = data != nullptr ? data->m_sideInfo : nullptr;
			info != nullptr;
			info = info->m_next) {
		if (info->m_side == side) {
			return info;
		}
	}
	return nullptr;
}

const AISideBuildList *find_ai_build_list(const TAiData *data, const char *side)
{
	for (const AISideBuildList *build = data != nullptr ? data->m_sideBuildLists : nullptr;
			build != nullptr;
			build = build->m_next) {
		if (build->m_side == side) {
			return build;
		}
	}
	return nullptr;
}

std::size_t count_ai_side_info(const TAiData *data)
{
	std::size_t count = 0;
	for (const AISideInfo *info = data != nullptr ? data->m_sideInfo : nullptr;
			info != nullptr;
			info = info->m_next) {
		++count;
	}
	return count;
}

std::size_t count_ai_build_lists(const TAiData *data)
{
	std::size_t count = 0;
	for (const AISideBuildList *build = data != nullptr ? data->m_sideBuildLists : nullptr;
			build != nullptr;
			build = build->m_next) {
		++count;
	}
	return count;
}

std::size_t count_ai_build_structures(const AISideBuildList *build)
{
	std::size_t count = 0;
	for (const BuildListInfo *info = build != nullptr ? build->m_buildList : nullptr;
			info != nullptr;
			info = info->getNext()) {
		++count;
	}
	return count;
}

std::size_t count_verified_fields(const RealGameDataIniProbeResult &result)
{
	return
		(result.shell_map_name == EXPECTED_SHELL_MAP_NAME ? 1U : 0U) +
		(result.use_fps_limit ? 1U : 0U) +
		(result.frames_per_second_limit == 30 ? 1U : 0U) +
		(result.max_shell_screens == 8 ? 1U : 0U) +
		(result.use_cloud_map ? 1U : 0U) +
		(std::fabs(result.default_structure_rubble_height - 10.0f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.group_select_volume_base - 0.5f) < 0.001f ? 1U : 0U) +
		(result.max_particle_count == 2500 ? 1U : 0U);
}

std::size_t count_verified_fields(const RealArmorIniProbeResult &result)
{
	return
		(result.no_armor_found ? 1U : 0U) +
		(result.human_armor_found ? 1U : 0U) +
		(result.tank_armor_found ? 1U : 0U) +
		(std::fabs(result.no_armor_explosion_damage - 100.0f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.no_armor_hazard_cleanup_damage - 0.0f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.human_crush_damage - 200.0f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.human_armor_piercing_damage - 10.0f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.human_flame_damage - 150.0f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.tank_small_arms_damage - 25.0f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.tank_radiation_damage - 50.0f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.tank_microwave_damage - 0.0f) < 0.001f ? 1U : 0U);
}

std::size_t count_verified_fields(const RealDamageFXIniProbeResult &result)
{
	return
		(result.default_damage_fx_found ? 1U : 0U) +
		(result.tank_damage_fx_found ? 1U : 0U) +
		(result.small_tank_damage_fx_found ? 1U : 0U) +
		(result.structure_damage_fx_found ? 1U : 0U) +
		(result.infantry_damage_fx_found ? 1U : 0U) +
		(result.default_explosion_throttle == 9U ? 1U : 0U) +
		(result.tank_small_arms_throttle == 3U ? 1U : 0U) +
		(result.small_tank_comanche_throttle == 3U ? 1U : 0U) +
		(result.structure_flame_throttle == 9U ? 1U : 0U) +
		(result.infantry_sniper_throttle == 3U ? 1U : 0U);
}

std::size_t count_verified_fields(const RealFXListIniProbeResult &result)
{
	return
		(result.list_count == 428 ? 1U : 0U) +
		(result.toxin_shell_found ? 1U : 0U) +
		(result.toxin_shell_nuggets == 1 ? 1U : 0U) +
		(result.car_crusher_found ? 1U : 0U) +
		(result.car_crusher_nuggets == 1 ? 1U : 0U) +
		(result.damage_tank_struck_found ? 1U : 0U) +
		(result.damage_tank_struck_nuggets == 6 ? 1U : 0U) +
		(result.moab_blast_found ? 1U : 0U) +
		(result.moab_blast_nuggets == 10 ? 1U : 0U) +
		(result.bunker_buster_found ? 1U : 0U) +
		(result.bunker_buster_nuggets == 8 ? 1U : 0U);
}

std::size_t count_verified_fields(const RealWeaponIniProbeResult &result)
{
	return
		(result.particle_template_count > 0 ? 1U : 0U) +
		(result.tomahawk_exhaust_template_found ? 1U : 0U) +
		(result.heroic_tomahawk_exhaust_template_found ? 1U : 0U) +
		(result.ranger_found ? 1U : 0U) +
		(std::fabs(result.ranger_primary_damage - 5.0f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.ranger_attack_range - 100.0f) < 0.001f ? 1U : 0U) +
		(result.ranger_delay_frames == 3 ? 1U : 0U) +
		(result.ranger_clip_size == 3 ? 1U : 0U) +
		(result.ranger_clip_reload_frames == 21 ? 1U : 0U) +
		(result.ranger_damage_type == DAMAGE_SMALL_ARMS ? 1U : 0U) +
		(result.ranger_death_type == DEATH_NORMAL ? 1U : 0U) +
		(result.ranger_fire_sound == "RangerWeapon" ? 1U : 0U) +
		(result.crusader_found ? 1U : 0U) +
		(std::fabs(result.crusader_primary_damage - 60.0f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.crusader_primary_damage_radius - 5.0f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.crusader_attack_range - 150.0f) < 0.001f ? 1U : 0U) +
		(result.crusader_delay_frames == 60 ? 1U : 0U) +
		(result.crusader_clip_size == 0 ? 1U : 0U) +
		(result.crusader_damage_type == DAMAGE_ARMOR_PIERCING ? 1U : 0U) +
		(result.crusader_death_type == DEATH_NORMAL ? 1U : 0U) +
		(result.crusader_fire_sound == "CrusaderTankWeapon" ? 1U : 0U) +
		(result.tomahawk_found ? 1U : 0U) +
		(std::fabs(result.tomahawk_primary_damage - 150.0f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.tomahawk_primary_damage_radius - 10.0f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.tomahawk_secondary_damage - 50.0f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.tomahawk_secondary_damage_radius - 25.0f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.tomahawk_attack_range - 350.0f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.tomahawk_minimum_attack_range - 97.5f) < 0.001f ? 1U : 0U) +
		(result.tomahawk_pre_attack_delay_frames == 8 ? 1U : 0U) +
		(result.tomahawk_delay_frames == 1 ? 1U : 0U) +
		(result.tomahawk_clip_size == 1 ? 1U : 0U) +
		(result.tomahawk_clip_reload_frames == 210 ? 1U : 0U) +
		(result.tomahawk_damage_type == DAMAGE_EXPLOSION ? 1U : 0U) +
		(result.tomahawk_death_type == DEATH_EXPLODED ? 1U : 0U) +
		(result.tomahawk_fire_sound == "TomahawkWeapon" ? 1U : 0U) +
		(result.tomahawk_projectile_exhaust_loaded ? 1U : 0U) +
		(result.tomahawk_heroic_projectile_exhaust_loaded ? 1U : 0U);
}

std::size_t count_verified_fields(const RealAIDataIniProbeResult &result)
{
	return
		(std::fabs(result.structure_seconds - 0.0f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.team_seconds - 10.0f) < 0.001f ? 1U : 0U) +
		(result.resources_wealthy == 7000 ? 1U : 0U) +
		(result.resources_poor == 2000 ? 1U : 0U) +
		(result.force_idle_frames == 3U ? 1U : 0U) +
		(std::fabs(result.structures_wealthy_rate - 2.0f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.teams_wealthy_rate - 2.0f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.structures_poor_rate - 0.6f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.teams_poor_rate - 0.6f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.team_resources_to_start - 0.1f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.guard_inner_modifier_ai - 1.1f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.guard_outer_modifier_ai - 1.333f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.guard_inner_modifier_human - 1.8f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.guard_outer_modifier_human - 2.2f) < 0.001f ? 1U : 0U) +
		(result.guard_chase_unit_frames == 300U ? 1U : 0U) +
		(result.guard_enemy_scan_frames == 15U ? 1U : 0U) +
		(result.guard_enemy_return_scan_frames == 30U ? 1U : 0U) +
		(std::fabs(result.attack_priority_distance_modifier - 100.0f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.max_recruit_radius - 500.0f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.skirmish_base_defense_extra_distance - 150.0f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.wall_height - 43.0f) < 0.001f ? 1U : 0U) +
		(result.attack_uses_line_of_sight ? 1U : 0U) +
		(result.attack_ignore_insignificant_buildings ? 1U : 0U) +
		(result.enable_repulsors ? 1U : 0U) +
		(result.min_infantry_for_group == 3 ? 1U : 0U) +
		(result.min_vehicles_for_group == 3 ? 1U : 0U) +
		(std::fabs(result.min_distance_for_group - 100.0f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.distance_requires_group - 500.0f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.supply_center_safe_radius - 300.0f) < 0.001f ? 1U : 0U) +
		(result.rebuild_delay_seconds == 30 ? 1U : 0U) +
		(result.ai_crushes_infantry ? 1U : 0U) +
		(result.side_info_count == 12 ? 1U : 0U) +
		(result.build_list_count == 12 ? 1U : 0U) +
		(result.america_side_found ? 1U : 0U) +
		(result.america_resource_gatherers_easy == 2 ? 1U : 0U) +
		(result.america_resource_gatherers_normal == 2 ? 1U : 0U) +
		(result.america_resource_gatherers_hard == 2 ? 1U : 0U) +
		(result.america_base_defense_structure == "AmericaPatriotBattery" ? 1U : 0U) +
		(result.america_skill_set1_count == 7 ? 1U : 0U) +
		(result.america_skill_set1_first_science == "SCIENCE_PaladinTank" ? 1U : 0U) +
		(result.gla_side_found ? 1U : 0U) +
		(result.gla_resource_gatherers_easy == 5 ? 1U : 0U) +
		(result.gla_base_defense_structure == "GLAStingerSite" ? 1U : 0U) +
		(result.america_build_list_found ? 1U : 0U) +
		(result.america_build_list_structure_count > 10 ? 1U : 0U) +
		(result.america_first_build_template == "AmericaCommandCenter" ? 1U : 0U) +
		(std::fabs(result.america_first_build_x - 501.22f) < 0.01f ? 1U : 0U) +
		(std::fabs(result.america_first_build_y - 546.25f) < 0.01f ? 1U : 0U) +
		(std::fabs(result.america_first_build_angle - (-135.0f * PI / 180.0f)) < 0.001f ? 1U : 0U) +
		(result.america_first_build_automatically_build ? 1U : 0U);
}

std::size_t count_verified_fields(const RealLocomotorIniProbeResult &result)
{
	return
		(result.template_count == 182 ? 1U : 0U) +
		(result.basic_human_found ? 1U : 0U) +
		(std::fabs(result.basic_human_speed - (20.0f / 30.0f)) < 0.001f ? 1U : 0U) +
		(std::fabs(result.basic_human_speed_damaged - (10.0f / 30.0f)) < 0.001f ? 1U : 0U) +
		(std::fabs(result.basic_human_turn_rate - (500.0f * PI / 180.0f / 30.0f)) < 0.001f ? 1U : 0U) +
		(std::fabs(result.basic_human_acceleration - (100.0f / 900.0f)) < 0.001f ? 1U : 0U) +
		(std::fabs(result.basic_human_braking - (100.0f / 900.0f)) < 0.001f ? 1U : 0U) +
		(result.basic_human_surfaces == (LOCOMOTORSURFACE_GROUND | LOCOMOTORSURFACE_RUBBLE) ? 1U : 0U) +
		(result.basic_human_appearance == LOCO_LEGS_TWO ? 1U : 0U) +
		(result.basic_human_z_behavior == Z_NO_Z_MOTIVE_FORCE ? 1U : 0U) +
		(result.basic_human_move_priority == LOCO_MOVES_FRONT ? 1U : 0U) +
		(result.basic_human_stick_to_ground ? 1U : 0U) +
		(result.missile_defender_found ? 1U : 0U) +
		(std::fabs(result.missile_defender_speed - (20.0f / 30.0f)) < 0.001f ? 1U : 0U) +
		(result.missile_defender_move_priority == LOCO_MOVES_MIDDLE ? 1U : 0U) +
		(result.humvee_found ? 1U : 0U) +
		(std::fabs(result.humvee_speed - (60.0f / 30.0f)) < 0.001f ? 1U : 0U) +
		(std::fabs(result.humvee_speed_damaged - (30.0f / 30.0f)) < 0.001f ? 1U : 0U) +
		(std::fabs(result.humvee_turn_rate - (180.0f * PI / 180.0f / 30.0f)) < 0.001f ? 1U : 0U) +
		(std::fabs(result.humvee_acceleration - (1000.0f / 900.0f)) < 0.001f ? 1U : 0U) +
		(std::fabs(result.humvee_braking - (1000.0f / 900.0f)) < 0.001f ? 1U : 0U) +
		(std::fabs(result.humvee_min_turn_speed - (20.0f / 30.0f)) < 0.001f ? 1U : 0U) +
		(std::fabs(result.humvee_turn_pivot_offset - (-0.33f)) < 0.001f ? 1U : 0U) +
		(std::fabs(result.humvee_wheel_turn_angle - (22.0f * PI / 180.0f)) < 0.001f ? 1U : 0U) +
		(std::fabs(result.humvee_max_wheel_extension - (-1.0f)) < 0.001f ? 1U : 0U) +
		(std::fabs(result.humvee_max_wheel_compression - 0.5f) < 0.001f ? 1U : 0U) +
		(result.humvee_surfaces == LOCOMOTORSURFACE_GROUND ? 1U : 0U) +
		(result.humvee_appearance == LOCO_WHEELS_FOUR ? 1U : 0U) +
		(result.humvee_z_behavior == Z_NO_Z_MOTIVE_FORCE ? 1U : 0U) +
		(!result.humvee_stick_to_ground ? 1U : 0U) +
		(result.humvee_has_suspension ? 1U : 0U) +
		(result.humvee_can_move_backward ? 1U : 0U) +
		(result.comanche_found ? 1U : 0U) +
		(std::fabs(result.comanche_speed - (120.0f / 30.0f)) < 0.001f ? 1U : 0U) +
		(std::fabs(result.comanche_speed_damaged - (120.0f / 30.0f)) < 0.001f ? 1U : 0U) +
		(std::fabs(result.comanche_turn_rate - (180.0f * PI / 180.0f / 30.0f)) < 0.001f ? 1U : 0U) +
		(std::fabs(result.comanche_acceleration - (60.0f / 900.0f)) < 0.001f ? 1U : 0U) +
		(std::fabs(result.comanche_lift - (120.0f / 900.0f)) < 0.001f ? 1U : 0U) +
		(std::fabs(result.comanche_lift_damaged - (80.0f / 900.0f)) < 0.001f ? 1U : 0U) +
		(std::fabs(result.comanche_braking - (240.0f / 900.0f)) < 0.001f ? 1U : 0U) +
		(std::fabs(result.comanche_preferred_height - 100.0f) < 0.001f ? 1U : 0U) +
		(result.comanche_surfaces == LOCOMOTORSURFACE_AIR ? 1U : 0U) +
		(result.comanche_appearance == LOCO_HOVER ? 1U : 0U) +
		(result.comanche_z_behavior == Z_SURFACE_RELATIVE_HEIGHT ? 1U : 0U) +
		(result.comanche_airborne_targeting_height == 30 ? 1U : 0U) +
		(result.comanche_allow_airborne_motive_force ? 1U : 0U) +
		(result.comanche_apply_2d_friction_when_airborne ? 1U : 0U) +
		(result.comanche_locomotor_works_when_dead ? 1U : 0U);
}

std::size_t count_verified_fields(const RealScienceIniProbeResult &result)
{
	return
		(result.science_count == 95 ? 1U : 0U) +
		(result.america_science_found ? 1U : 0U) +
		(result.rank3_science_found ? 1U : 0U) +
		(result.paladin_science_found ? 1U : 0U) +
		(result.america_purchase_cost == 0 ? 1U : 0U) +
		(result.paladin_purchase_cost == 1 ? 1U : 0U) +
		(!result.america_grantable ? 1U : 0U) +
		(result.paladin_grantable ? 1U : 0U) +
		(result.paladin_name_loaded ? 1U : 0U) +
		(result.paladin_description_loaded ? 1U : 0U);
}

std::size_t count_verified_fields(const RealSpecialPowerIniProbeResult &result)
{
	return
		(result.special_power_count == 79 ? 1U : 0U) +
		(result.daisy_cutter_found ? 1U : 0U) +
		(result.carpet_bomb_found ? 1U : 0U) +
		(result.crate_drop_found ? 1U : 0U) +
		(result.neutron_missile_found ? 1U : 0U) +
		(result.scud_storm_found ? 1U : 0U) +
		(result.daisy_cutter_enum == SPECIAL_DAISY_CUTTER ? 1U : 0U) +
		(result.carpet_bomb_enum == SPECIAL_CARPET_BOMB ? 1U : 0U) +
		(result.crate_drop_enum == SPECIAL_CRATE_DROP ? 1U : 0U) +
		(result.daisy_cutter_reload_frames == 10800 ? 1U : 0U) +
		(result.carpet_bomb_reload_frames == 4500 ? 1U : 0U) +
		(result.crate_drop_reload_frames == 18000 ? 1U : 0U) +
		(result.daisy_cutter_required_science_valid ? 1U : 0U) +
		(result.crate_drop_required_science_valid ? 1U : 0U) +
		(!result.daisy_cutter_public_timer ? 1U : 0U) +
		(result.carpet_bomb_public_timer ? 1U : 0U) +
		(result.crate_drop_public_timer ? 1U : 0U) +
		(result.daisy_cutter_shared_synced_timer ? 1U : 0U) +
		(result.carpet_bomb_shared_synced_timer ? 1U : 0U) +
		(!result.crate_drop_shared_synced_timer ? 1U : 0U) +
		(result.daisy_cutter_view_object_duration_frames == 900 ? 1U : 0U) +
		(result.carpet_bomb_view_object_duration_frames == 1200 ? 1U : 0U) +
		(result.crate_drop_view_object_duration_frames == 900 ? 1U : 0U) +
		(std::fabs(result.daisy_cutter_view_object_range - 250.0f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.carpet_bomb_view_object_range - 250.0f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.crate_drop_view_object_range - 250.0f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.daisy_cutter_radius_cursor_radius - 170.0f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.carpet_bomb_radius_cursor_radius - 100.0f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.crate_drop_radius_cursor_radius - 100.0f) < 0.001f ? 1U : 0U) +
		(result.daisy_cutter_shortcut_power ? 1U : 0U) +
		(result.carpet_bomb_shortcut_power ? 1U : 0U) +
		(result.crate_drop_shortcut_power ? 1U : 0U) +
		(result.daisy_cutter_academy_classification == ACT_SUPERPOWER ? 1U : 0U) +
		(result.carpet_bomb_academy_classification == ACT_SUPERPOWER ? 1U : 0U) +
		(result.daisy_cutter_required_science == "SCIENCE_DaisyCutter" ? 1U : 0U) +
		(result.crate_drop_required_science == "SCIENCE_CrateDrop" ? 1U : 0U) +
		(result.neutron_missile_initiate_at_location_sound == "AirRaidSiren" ? 1U : 0U) +
		(result.scud_storm_initiate_sound == "ScudStormInitiated" ? 1U : 0U);
}

std::size_t count_verified_fields(const RealCommandButtonIniProbeResult &result)
{
	return
		(result.filtered_from_shipped ? 1U : 0U) +
		(result.filtered_blocks == 3 ? 1U : 0U) +
		(result.button_count == 3 ? 1U : 0U) +
		(result.flash_bang_upgrade_found ? 1U : 0U) +
		(result.flash_bang_upgrade_command == GUI_COMMAND_PLAYER_UPGRADE ? 1U : 0U) +
		(result.flash_bang_upgrade_border == COMMAND_BUTTON_BORDER_UPGRADE ? 1U : 0U) +
		(result.flash_bang_upgrade_name == "Upgrade_AmericaRangerFlashBangGrenade" ? 1U : 0U) +
		(result.flash_bang_upgrade_label == "CONTROLBAR:UpgradeAmericaFlashBangGrenade" ? 1U : 0U) +
		(result.flash_bang_upgrade_description ==
			"CONTROLBAR:TooltipUSAUpgradeFlashBangGrenades" ? 1U : 0U) +
		(result.ranger_capture_found ? 1U : 0U) +
		(result.ranger_capture_command == GUI_COMMAND_SPECIAL_POWER ? 1U : 0U) +
		(result.ranger_capture_border == COMMAND_BUTTON_BORDER_ACTION ? 1U : 0U) +
		(result.ranger_capture_upgrade_name == "Upgrade_InfantryCaptureBuilding" ? 1U : 0U) +
		(result.ranger_capture_special_power_name == "SpecialAbilityRangerCaptureBuilding" ? 1U : 0U) +
		(result.ranger_capture_label == "CONTROLBAR:CaptureBuilding" ? 1U : 0U) +
		(result.ranger_capture_description == "CONTROLBAR:ToolTipUSARangerCaptureBuilding" ? 1U : 0U) +
		(result.ranger_capture_cursor == "CaptureBuilding" ? 1U : 0U) +
		(result.ranger_capture_invalid_cursor == "GenericInvalid" ? 1U : 0U) +
		(result.ranger_capture_has_enemy_target ? 1U : 0U) +
		(result.ranger_capture_has_neutral_target ? 1U : 0U) +
		(result.ranger_capture_has_multi_select ? 1U : 0U) +
		(result.ranger_capture_has_need_upgrade ? 1U : 0U) +
		(result.ranger_capture_has_need_special_power_science ? 1U : 0U) +
		(result.flash_bang_switch_found ? 1U : 0U) +
		(result.flash_bang_switch_command == GUI_COMMAND_SWITCH_WEAPON ? 1U : 0U) +
		(result.flash_bang_switch_weapon_slot == SECONDARY_WEAPON ? 1U : 0U) +
		(result.flash_bang_switch_border == COMMAND_BUTTON_BORDER_ACTION ? 1U : 0U) +
		(result.flash_bang_switch_upgrade_name == "Upgrade_AmericaRangerFlashBangGrenade" ? 1U : 0U) +
		(result.flash_bang_switch_label == "CONTROLBAR:FlashBangGrenadeMode" ? 1U : 0U) +
		(result.flash_bang_switch_description == "CONTROLBAR:ToolTipSwitchToUSAFlashBang" ? 1U : 0U) +
		(result.flash_bang_switch_has_check_like ? 1U : 0U) +
		(result.flash_bang_switch_has_multi_select ? 1U : 0U) +
		(result.flash_bang_switch_has_need_upgrade ? 1U : 0U) +
		(result.special_power_option_pairing_valid ? 1U : 0U);
}

std::size_t count_verified_fields(const RealCommandSetIniProbeResult &result)
{
	return
		(result.filtered_from_shipped ? 1U : 0U) +
		(result.filtered_command_button_blocks == 6 ? 1U : 0U) +
		(result.filtered_command_set_blocks == 1 ? 1U : 0U) +
		(result.command_button_count == 6 ? 1U : 0U) +
		(result.command_set_count == 1 ? 1U : 0U) +
		(result.ranger_set_found ? 1U : 0U) +
		(result.ranger_slot1 == "Command_AmericaRangerCaptureBuilding" ? 1U : 0U) +
		(result.ranger_slot2 == "Command_AmericaRangerSwitchToMachineGun" ? 1U : 0U) +
		(result.ranger_slot4 == "Command_AmericaRangerSwitchToFlagBangGrenades" ? 1U : 0U) +
		(result.ranger_slot11 == "Command_AttackMove" ? 1U : 0U) +
		(result.ranger_slot13 == "Command_Guard" ? 1U : 0U) +
		(result.ranger_slot14 == "Command_Stop" ? 1U : 0U) +
		(result.ranger_slot1_command == GUI_COMMAND_SPECIAL_POWER ? 1U : 0U) +
		(result.ranger_slot2_command == GUI_COMMAND_SWITCH_WEAPON ? 1U : 0U) +
		(result.ranger_slot4_command == GUI_COMMAND_SWITCH_WEAPON ? 1U : 0U) +
		(result.ranger_slot11_command == GUI_COMMAND_ATTACK_MOVE ? 1U : 0U) +
		(result.ranger_slot13_command == GUI_COMMAND_GUARD ? 1U : 0U) +
		(result.ranger_slot14_command == GUI_COMMAND_STOP ? 1U : 0U) +
		(result.ranger_slot2_weapon_slot == PRIMARY_WEAPON ? 1U : 0U) +
		(result.ranger_slot4_weapon_slot == SECONDARY_WEAPON ? 1U : 0U) +
		(result.ranger_slot1_special_power == "SpecialAbilityRangerCaptureBuilding" ? 1U : 0U) +
		(result.ranger_slot1_upgrade == "Upgrade_InfantryCaptureBuilding" ? 1U : 0U) +
		(result.ranger_slot4_upgrade == "Upgrade_AmericaRangerFlashBangGrenade" ? 1U : 0U);
}

std::size_t count_verified_fields(const RealPlayerTemplateIniProbeResult &result)
{
	return
		(result.player_template_count == 15 ? 1U : 0U) +
		(result.side_count == 15 ? 1U : 0U) +
		(result.america_found ? 1U : 0U) +
		(result.china_found ? 1U : 0U) +
		(result.gla_found ? 1U : 0U) +
		(result.observer_found ? 1U : 0U) +
		(result.air_force_found ? 1U : 0U) +
		(result.boss_found ? 1U : 0U) +
		(result.america_display_name_loaded ? 1U : 0U) +
		(result.america_side == "America" ? 1U : 0U) +
		(result.america_base_side == "USA" ? 1U : 0U) +
		(result.america_playable ? 1U : 0U) +
		(result.america_old_faction ? 1U : 0U) +
		(result.america_start_money == 0 ? 1U : 0U) +
		(result.america_intrinsic_science_count == 1 ? 1U : 0U) +
		(result.america_intrinsic_science_valid ? 1U : 0U) +
		(result.america_starting_building == "AmericaCommandCenter" ? 1U : 0U) +
		(result.america_starting_unit0 == "AmericaVehicleDozer" ? 1U : 0U) +
		(result.america_shortcut_command_set == "SpecialPowerShortcutUSA" ? 1U : 0U) +
		(result.america_shortcut_win_name == "GenPowersShortcutBarUS.wnd" ? 1U : 0U) +
		(result.america_shortcut_button_count == 10 ? 1U : 0U) +
		(result.america_load_screen == "SAFactionLogoPage_US" ? 1U : 0U) +
		(result.america_score_screen == "America_ScoreScreen" ? 1U : 0U) +
		(result.america_load_music == "Load_USA" ? 1U : 0U) +
		(result.america_score_music == "Score_USA" ? 1U : 0U) +
		(result.america_beacon == "MultiplayerBeacon" ? 1U : 0U) +
		(result.observer_is_observer ? 1U : 0U) +
		(!result.observer_playable ? 1U : 0U) +
		(result.observer_side == "Observer" ? 1U : 0U) +
		(result.observer_load_screen == "Mp_Load" ? 1U : 0U) +
		(result.observer_beacon == "MultiplayerBeacon" ? 1U : 0U) +
		(result.air_force_side == "AmericaAirForceGeneral" ? 1U : 0U) +
		(result.air_force_base_side == "USA" ? 1U : 0U) +
		(result.air_force_playable ? 1U : 0U) +
		(!result.air_force_old_faction ? 1U : 0U) +
		(result.air_force_starting_building == "AirF_AmericaCommandCenter" ? 1U : 0U) +
		(result.air_force_starting_unit0 == "AirF_AmericaVehicleDozer" ? 1U : 0U) +
		(result.air_force_shortcut_command_set == "AirF_SpecialPowerShortcutUSA" ? 1U : 0U) +
		(result.air_force_shortcut_button_count == 11 ? 1U : 0U) +
		(result.boss_side == "Boss" ? 1U : 0U) +
		(result.boss_base_side == "China" ? 1U : 0U) +
		(result.boss_playable ? 1U : 0U) +
		(!result.boss_old_faction ? 1U : 0U) +
		(result.boss_intrinsic_science_count == 3 ? 1U : 0U) +
		(result.boss_intrinsic_sciences_valid ? 1U : 0U) +
		(result.boss_starting_building == "Boss_CommandCenter" ? 1U : 0U) +
		(result.boss_starting_unit0 == "Boss_VehicleDozer" ? 1U : 0U) +
		(result.boss_shortcut_command_set == "SpecialPowerShortcutBoss" ? 1U : 0U) +
		(result.boss_shortcut_win_name == "GenPowersShortcutBarChina.wnd" ? 1U : 0U) +
		(result.boss_shortcut_button_count == 9 ? 1U : 0U);
}

std::size_t count_verified_fields(const RealWeatherIniProbeResult &result)
{
	return
		(result.snow_texture == "ExSnowFlake.tga" ? 1U : 0U) +
		(!result.snow_enabled ? 1U : 0U) +
		(result.use_point_sprites ? 1U : 0U) +
		(std::fabs(result.snow_box_dimensions - 200.0f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.snow_box_density - 1.0f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.snow_frequency_scale_x - 0.0533f) < 0.0001f ? 1U : 0U) +
		(std::fabs(result.snow_frequency_scale_y - 0.0275f) < 0.0001f ? 1U : 0U) +
		(std::fabs(result.snow_amplitude - 5.0f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.snow_velocity - 4.0f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.snow_point_size - 1.0f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.snow_quad_size - 0.5f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.snow_max_point_size - 64.0f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.snow_min_point_size - 0.0f) < 0.001f ? 1U : 0U);
}

std::size_t count_verified_fields(const RealWaterIniProbeResult &result)
{
	return
		(result.water_set_count == 4 ? 1U : 0U) +
		(result.transparency_loaded ? 1U : 0U) +
		(result.morning_sky_texture == "TSCloudWis.tga" ? 1U : 0U) +
		(result.morning_water_texture == "TSWater.tga" ? 1U : 0U) +
		(result.morning_water_repeat_count == 32 ? 1U : 0U) +
		(std::fabs(result.morning_sky_texels_per_unit - 0.8f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.morning_u_scroll_per_ms - 0.002f) < 0.0001f ? 1U : 0U) +
		(std::fabs(result.morning_v_scroll_per_ms - 0.002f) < 0.0001f ? 1U : 0U) +
		(result.night_sky_texture == "TSStarFeld.tga" ? 1U : 0U) +
		(result.night_water_texture == "TSWater.tga" ? 1U : 0U) +
		(result.night_water_repeat_count == 32 ? 1U : 0U) +
		(std::fabs(result.night_sky_texels_per_unit - 1.6f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.night_u_scroll_per_ms - 0.0f) < 0.0001f ? 1U : 0U) +
		(std::fabs(result.night_v_scroll_per_ms - 0.0f) < 0.0001f ? 1U : 0U) +
		(result.standing_water_texture == "TWWater01.tga" ? 1U : 0U) +
		(std::fabs(result.transparent_water_depth - 3.0f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.transparent_water_min_opacity - 1.0f) < 0.001f ? 1U : 0U) +
		(!result.additive_blending ? 1U : 0U);
}

std::size_t count_verified_fields(const RealVideoIniProbeResult &result)
{
	return
		(result.video_count > 0 ? 1U : 0U) +
		(!result.first_internal_name.empty() ? 1U : 0U) +
		(!result.first_filename.empty() ? 1U : 0U) +
		(!result.sample_internal_name.empty() ? 1U : 0U) +
		(!result.sample_filename.empty() ? 1U : 0U);
}

std::size_t count_verified_fields(const RealMultiplayerIniProbeResult &result)
{
	return
		(result.start_countdown_seconds == 5 ? 1U : 0U) +
		(result.max_beacons_per_player == 3 ? 1U : 0U) +
		(!result.use_shroud ? 1U : 0U) +
		(result.show_random_player_template ? 1U : 0U) +
		(result.show_random_start_pos ? 1U : 0U) +
		(result.show_random_color ? 1U : 0U) +
		(result.color_count == 8 ? 1U : 0U) +
		(result.gold_color_found ? 1U : 0U) +
		(result.gold_color == 0xFFDDE20DU ? 1U : 0U) +
		(result.purple_color_found ? 1U : 0U) +
		(result.purple_night_color == 0xFFDF009CU ? 1U : 0U) +
		(result.starting_money_count == 4 ? 1U : 0U) +
		(result.starting_money_first == 5000 ? 1U : 0U) +
		(result.starting_money_second == 10000 ? 1U : 0U) +
		(result.starting_money_third == 20000 ? 1U : 0U) +
		(result.starting_money_fourth == 50000 ? 1U : 0U) +
		(result.default_starting_money == 10000 ? 1U : 0U) +
		(result.chat_default_color == 0xFFFFFFFFU ? 1U : 0U) +
		(result.chat_game_color == 0xFFFFFFFFU ? 1U : 0U) +
		(result.chat_player_normal_color == 0xFFFF0000U ? 1U : 0U) +
		(result.chat_self_color == 0xFFFF8000U ? 1U : 0U) +
		(result.chat_map_selected_color == 0xFFFFFF00U ? 1U : 0U);
}

std::size_t count_verified_fields(const RealTerrainIniProbeResult &result)
{
	return
		(result.terrain_count == 247 ? 1U : 0U) +
		(result.transition_found ? 1U : 0U) +
		(result.transition_texture == "TTGrasRock01a.tga" ? 1U : 0U) +
		(result.transition_class == TERRAIN_TRANSITION ? 1U : 0U) +
		(result.asphalt_found ? 1U : 0U) +
		(result.asphalt_texture == "TXAsph01a.tga" ? 1U : 0U) +
		(result.asphalt_class == TERRAIN_ASPHALT ? 1U : 0U) +
		(!result.asphalt_blend_edges ? 1U : 0U) +
		(!result.asphalt_restrict_construction ? 1U : 0U) +
		(result.desert_dry_found ? 1U : 0U) +
		(result.desert_dry_texture == "TMDirt07e.tga" ? 1U : 0U) +
		(result.desert_dry_class == TERRAIN_DRY_DESERT ? 1U : 0U) +
		(result.beach_tropical_found ? 1U : 0U) +
		(result.beach_tropical_texture == "TMSand13h.tga" ? 1U : 0U) +
		(result.beach_tropical_class == TERRAIN_TROPICAL_BEACH ? 1U : 0U) +
		(result.snow_flat_found ? 1U : 0U) +
		(result.snow_flat_texture == "TXSnow01a.tga" ? 1U : 0U) +
		(result.snow_flat_class == TERRAIN_FLAT_SNOW ? 1U : 0U);
}

std::size_t count_verified_fields(const RealTerrainRoadsIniProbeResult &result)
{
	return
		(result.road_count == 63 ? 1U : 0U) +
		(result.bridge_count == 27 ? 1U : 0U) +
		(result.two_lane_found ? 1U : 0U) +
		(result.two_lane_texture == "TRTwoLane.tga" ? 1U : 0U) +
		(std::fabs(result.two_lane_width - 35.0f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.two_lane_width_in_texture - 0.9f) < 0.001f ? 1U : 0U) +
		(result.four_lane_found ? 1U : 0U) +
		(result.four_lane_texture == "TRFourLane.tga" ? 1U : 0U) +
		(std::fabs(result.four_lane_width - 60.0f) < 0.001f ? 1U : 0U) +
		(result.dirt_road_found ? 1U : 0U) +
		(result.dirt_road_texture == "TRDirtRoad.tga" ? 1U : 0U) +
		(std::fabs(result.dirt_road_width - 52.0f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.dirt_road_width_in_texture - 0.95f) < 0.001f ? 1U : 0U) +
		(result.concrete_bridge_found ? 1U : 0U) +
		(result.concrete_bridge_texture == "CBBridgeSt.tga" ? 1U : 0U) +
		(result.concrete_bridge_model == "CBBridgeSt" ? 1U : 0U) +
		(result.concrete_bridge_damaged_texture == "CBBridgeSt_d.tga" ? 1U : 0U) +
		(result.concrete_bridge_scaffold == "BridgeScaffold01" ? 1U : 0U) +
		(result.concrete_bridge_tower_left == "BridgeTowerConcreteLeft01" ? 1U : 0U) +
		(result.concrete_bridge_damage_sound == "BridgeDamaged" ? 1U : 0U) +
		(result.concrete_bridge_repaired_sound == "BridgeRepaired" ? 1U : 0U) +
		(result.concrete_bridge_damage_ocl == "OCL_BridgeDamaged01" ? 1U : 0U) +
		(result.concrete_bridge_damage_fx == "FX_BridgeDamaged01" ? 1U : 0U) +
		(result.concrete_bridge_repair_fx == "FX_BridgeRepaired01" ? 1U : 0U) +
		(std::fabs(result.concrete_bridge_scale - 0.85f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.concrete_bridge_radar_red - (192.0f / 255.0f)) < 0.001f ? 1U : 0U) +
		(std::fabs(result.concrete_bridge_radar_green - (192.0f / 255.0f)) < 0.001f ? 1U : 0U) +
		(std::fabs(result.concrete_bridge_radar_blue - (192.0f / 255.0f)) < 0.001f ? 1U : 0U) +
		(std::fabs(result.concrete_bridge_transition_effects_height - 0.0f) < 0.001f ? 1U : 0U) +
		(result.concrete_bridge_num_fx_per_type == 32 ? 1U : 0U);
}

std::size_t count_verified_fields(const RealDrawGroupInfoIniProbeResult &result)
{
	return
		(result.font_name == "Arial" ? 1U : 0U) +
		(result.font_size == 10 ? 1U : 0U) +
		(!result.font_is_bold ? 1U : 0U) +
		(result.use_player_color ? 1U : 0U) +
		(result.color_for_text == 0xffffffffU ? 1U : 0U) +
		(result.color_for_text_drop_shadow == 0xff000000U ? 1U : 0U) +
		(result.drop_shadow_offset_x == -1 ? 1U : 0U) +
		(result.drop_shadow_offset_y == -1 ? 1U : 0U) +
		(!result.using_pixel_offset_x ? 1U : 0U) +
		(std::fabs(result.percent_offset_x - -0.05f) < 0.001f ? 1U : 0U) +
		(result.using_pixel_offset_y ? 1U : 0U) +
		(result.pixel_offset_y == -10 ? 1U : 0U);
}

std::size_t count_verified_fields(const RealMappedImageIniProbeResult &result)
{
	return
		(result.file_count == 14 ? 1U : 0U) +
		(result.image_count == 1186 ? 1U : 0U) +
		(result.sa_chinook_found ? 1U : 0U) +
		(result.sa_chinook_texture == "SAUserInterface512_001.tga" ? 1U : 0U) +
		(result.sa_chinook_texture_width == 512 ? 1U : 0U) +
		(result.sa_chinook_texture_height == 512 ? 1U : 0U) +
		(result.sa_chinook_width == 120 ? 1U : 0U) +
		(result.sa_chinook_height == 96 ? 1U : 0U) +
		(result.sa_chinook_status == IMAGE_STATUS_NONE ? 1U : 0U) +
		(std::fabs(result.sa_chinook_uv_lo_x - (367.0f / 512.0f)) < 0.0001f ? 1U : 0U) +
		(std::fabs(result.sa_chinook_uv_lo_y - (393.0f / 512.0f)) < 0.0001f ? 1U : 0U) +
		(std::fabs(result.sa_chinook_uv_hi_x - (487.0f / 512.0f)) < 0.0001f ? 1U : 0U) +
		(std::fabs(result.sa_chinook_uv_hi_y - (489.0f / 512.0f)) < 0.0001f ? 1U : 0U) +
		(result.watermark_china_found ? 1U : 0U) +
		(result.watermark_china_texture == "SCShellUserInterface512_001.tga" ? 1U : 0U) +
		(result.watermark_china_width == 160 ? 1U : 0U) +
		(result.watermark_china_height == 96 ? 1U : 0U) +
		(result.watermark_china_rotated ? 1U : 0U);
}

std::size_t count_verified_fields(const RealControlBarSchemeIniProbeResult &result)
{
	return
		(result.default_found ? 1U : 0U) +
		(result.default_queue_image.empty() ? 1U : 0U) +
		(result.default_right_hud_image.empty() ? 1U : 0U) +
		(result.default_base_image == "InGameUIAmericaBase" ? 1U : 0U) +
		(result.default_base_layer == 4 ? 1U : 0U) +
		(result.default_base_width == 800 ? 1U : 0U) +
		(result.default_base_height == 191 ? 1U : 0U) +
		(result.america_found ? 1U : 0U) +
		(result.america_side == "America" ? 1U : 0U) +
		(result.america_queue_image.empty() ? 1U : 0U) +
		(result.america_right_hud_image.empty() ? 1U : 0U) +
		(result.america_command_marker_image == "SAEmptyFrame" ? 1U : 0U) +
		(result.america_power_purchase_image == "GeneralsPowerWindow_American" ? 1U : 0U) +
		(result.america_base_image == "InGameUIAmericaBase" ? 1U : 0U) +
		(result.america_screen_x == 800 ? 1U : 0U) +
		(result.america_screen_y == 600 ? 1U : 0U) +
		(result.america_base_layer == 4 ? 1U : 0U) +
		(result.america_base_x == 0 ? 1U : 0U) +
		(result.america_base_y == 408 ? 1U : 0U) +
		(result.america_base_width == 800 ? 1U : 0U) +
		(result.america_base_height == 191 ? 1U : 0U) +
		(result.gla_found ? 1U : 0U) +
		(result.gla_side == "GLA" ? 1U : 0U) +
		(result.gla_right_hud_image.empty() ? 1U : 0U) +
		(result.gla_command_marker_image == "SUEmptyFrame" ? 1U : 0U) +
		(result.gla_power_purchase_image == "GeneralsPowerWindow_GLA" ? 1U : 0U) +
		(result.gla_base_image == "InGameUIGLABase" ? 1U : 0U) +
		(result.china_found ? 1U : 0U) +
		(result.china_side == "China" ? 1U : 0U) +
		(result.china_right_hud_image.empty() ? 1U : 0U) +
		(result.china_command_marker_image == "SNEmptyFrame" ? 1U : 0U) +
		(result.china_power_purchase_image == "GeneralsPowerMenu_China" ? 1U : 0U) +
		(result.china_gen_arrow_image.empty() ? 1U : 0U) +
		(result.china_base_image == "InGameUIChinaBase" ? 1U : 0U);
}

std::size_t count_verified_fields(const RealCrateIniProbeResult &result)
{
	return
		(result.crate_template_count == 7 ? 1U : 0U) +
		(result.filtered_from_shipped ? 1U : 0U) +
		(result.filtered_blocks == 7 ? 1U : 0U) +
		(result.salvage_found ? 1U : 0U) +
		(std::fabs(result.salvage_creation_chance - 1.0f) < 0.001f ? 1U : 0U) +
		(result.salvage_salvager_kindof ? 1U : 0U) +
		(result.salvage_killer_science_valid ? 1U : 0U) +
		(result.salvage_object_count == 1 ? 1U : 0U) +
		(result.salvage_object_name == "SalvageCrate" ? 1U : 0U) +
		(std::fabs(result.salvage_object_chance - 1.0f) < 0.001f ? 1U : 0U) +
		(result.elite_found ? 1U : 0U) +
		(std::fabs(result.elite_creation_chance - 0.75f) < 0.001f ? 1U : 0U) +
		(result.elite_veterancy_level == LEVEL_ELITE ? 1U : 0U) +
		(result.elite_object_count == 2 ? 1U : 0U) +
		(result.elite_first_object == "1000DollarCrate" ? 1U : 0U) +
		(std::fabs(result.elite_first_chance - 0.75f) < 0.001f ? 1U : 0U) +
		(result.elite_second_object == "SmallLevelUpCrate" ? 1U : 0U) +
		(std::fabs(result.elite_second_chance - 0.25f) < 0.001f ? 1U : 0U) +
		(result.heroic_found ? 1U : 0U) +
		(std::fabs(result.heroic_creation_chance - 1.0f) < 0.001f ? 1U : 0U) +
		(result.heroic_veterancy_level == LEVEL_HEROIC ? 1U : 0U) +
		(result.heroic_object_count == 3 ? 1U : 0U) +
		(result.heroic_first_object == "2500DollarCrate" ? 1U : 0U) +
		(std::fabs(result.heroic_first_chance - 0.5f) < 0.001f ? 1U : 0U) +
		(result.heroic_third_object == "2FreeCrusadersCrate" ? 1U : 0U) +
		(std::fabs(result.heroic_third_chance - 0.25f) < 0.001f ? 1U : 0U) +
		(result.gla02_100_found ? 1U : 0U) +
		(result.gla02_100_owned_by_maker ? 1U : 0U) +
		(result.gla02_100_object == "100DollarCrate" ? 1U : 0U) +
		(std::fabs(result.gla02_100_object_chance - 1.0f) < 0.001f ? 1U : 0U) +
		(result.gla02_2500_found ? 1U : 0U) +
		(result.gla02_2500_owned_by_maker ? 1U : 0U) +
		(result.gla02_2500_object == "2500DollarCrate" ? 1U : 0U) +
		(std::fabs(result.gla02_2500_object_chance - 1.0f) < 0.001f ? 1U : 0U);
}

std::size_t count_verified_fields(const RealUpgradeIniProbeResult &result)
{
	return
		(result.upgrade_count == 83 ? 1U : 0U) +
		(result.veteran_found ? 1U : 0U) +
		(result.elite_found ? 1U : 0U) +
		(result.heroic_found ? 1U : 0U) +
		(result.flash_bang_found ? 1U : 0U) +
		(result.flash_bang_display_name == "UPGRADE:RangerFlashBangGrenade" ? 1U : 0U) +
		(result.flash_bang_type == UPGRADE_TYPE_PLAYER ? 1U : 0U) +
		(result.flash_bang_build_frames == 900 ? 1U : 0U) +
		(result.flash_bang_cost == 800 ? 1U : 0U) +
		(result.flash_bang_research_sound == "RangerVoiceUpgradeFlashBangGrenades" ? 1U : 0U) +
		(result.capture_building_found ? 1U : 0U) +
		(result.capture_building_display_name == "UPGRADE:RangerCaptureBuilding" ? 1U : 0U) +
		(result.capture_building_type == UPGRADE_TYPE_PLAYER ? 1U : 0U) +
		(result.capture_building_build_frames == 900 ? 1U : 0U) +
		(result.capture_building_cost == 1000 ? 1U : 0U) +
		(result.laser_missiles_found ? 1U : 0U) +
		(result.laser_missiles_display_name == "UPGRADE:AmericaLaserMissiles" ? 1U : 0U) +
		(result.laser_missiles_type == UPGRADE_TYPE_PLAYER ? 1U : 0U) +
		(result.laser_missiles_build_frames == 1200 ? 1U : 0U) +
		(result.laser_missiles_cost == 1500 ? 1U : 0U) +
		(result.laser_missiles_research_sound == "RaptorVoiceUpgradeLaserGuidedMissiles" ? 1U : 0U) +
		(result.china_mines_found ? 1U : 0U) +
		(result.china_mines_display_name == "UPGRADE:Mines" ? 1U : 0U) +
		(result.china_mines_type == UPGRADE_TYPE_OBJECT ? 1U : 0U) +
		(result.china_mines_build_frames == 600 ? 1U : 0U) +
		(result.china_mines_cost == 600 ? 1U : 0U) +
		(result.china_mines_research_sound == "MineFieldPlaced" ? 1U : 0U) +
		(result.america_radar_found ? 1U : 0U) +
		(result.america_radar_display_name == "UPGRADE:Radar" ? 1U : 0U) +
		(result.america_radar_type == UPGRADE_TYPE_OBJECT ? 1U : 0U) +
		(result.america_radar_build_frames == 300 ? 1U : 0U) +
		(result.america_radar_cost == 500 ? 1U : 0U) +
		(result.america_radar_research_sound.empty() ? 1U : 0U) +
		(result.america_radar_academy_classification == ACT_UPGRADE_RADAR ? 1U : 0U);
}

void reset_water_settings()
{
	for (int index = 0; index < TIME_OF_DAY_COUNT; ++index) {
		WaterSettings[index] = WaterSetting();
	}
}

void copy_water_settings(WaterSetting (&destination)[TIME_OF_DAY_COUNT])
{
	for (int index = 0; index < TIME_OF_DAY_COUNT; ++index) {
		destination[index] = WaterSettings[index];
	}
}

void restore_water_settings(const WaterSetting (&source)[TIME_OF_DAY_COUNT])
{
	for (int index = 0; index < TIME_OF_DAY_COUNT; ++index) {
		WaterSettings[index] = source[index];
	}
}

std::size_t count_loaded_water_settings()
{
	std::size_t count = 0;
	for (int index = TIME_OF_DAY_FIRST; index < TIME_OF_DAY_COUNT; ++index) {
		if (!WaterSettings[index].m_waterTextureFile.isEmpty()) {
			++count;
		}
	}
	return count;
}

bool unicode_not_empty(const UnicodeString &value)
{
	return !value.isEmpty() && value.getLength() > 0;
}

bool sciences_valid(const ScienceStore &science_store, const ScienceVec &sciences)
{
	if (sciences.empty()) {
		return false;
	}

	for (ScienceVec::const_iterator it = sciences.begin(); it != sciences.end(); ++it) {
		if (!science_store.isValidScience(*it)) {
			return false;
		}
	}

	return true;
}

void seed_player_template_alias_name_keys()
{
	// PlayerTemplateStore caches old-map alias keys in function statics; keep
	// focused repeated probes on the same key order as the first original load.
	(void)NAMEKEY("FactionCivilian");
	(void)NAMEKEY("FactionAmerica");
	(void)NAMEKEY("FactionAmericaChooseAGeneral");
	(void)NAMEKEY("FactionAmericaTankCommand");
	(void)NAMEKEY("FactionAmericaSpecialForces");
	(void)NAMEKEY("FactionAmericaAirForce");
	(void)NAMEKEY("FactionChina");
	(void)NAMEKEY("FactionChinaChooseAGeneral");
	(void)NAMEKEY("FactionChinaRedArmy");
	(void)NAMEKEY("FactionChinaSpecialWeapons");
	(void)NAMEKEY("FactionChinaSecretPolice");
	(void)NAMEKEY("FactionGLA");
	(void)NAMEKEY("FactionGLAChooseAGeneral");
	(void)NAMEKEY("FactionGLATerrorCell");
	(void)NAMEKEY("FactionGLABiowarCommand");
	(void)NAMEKEY("FactionGLAWarlordCommand");
}

void inspect_map_cache_entry(
	MapCache &map_cache,
	const char *path,
	bool &exists,
	bool &has_display_name,
	int &player_count)
{
	MapCache::const_iterator it = map_cache.find(AsciiString(path));
	exists = it != map_cache.end();
	if (!exists) {
		has_display_name = false;
		player_count = 0;
		return;
	}

	has_display_name = unicode_not_empty(it->second.m_displayName);
	player_count = it->second.m_numPlayers;
}

std::size_t count_terrain_collection(TerrainTypeCollection &terrain_types)
{
	std::size_t count = 0;
	for (TerrainType *terrain = terrain_types.firstTerrain(); terrain != nullptr;
			terrain = terrain_types.nextTerrain(terrain)) {
		++count;
	}
	return count;
}

void inspect_terrain_entry(
	TerrainTypeCollection &terrain_types,
	const char *name,
	bool &found,
	std::string &texture,
	int &terrain_class)
{
	TerrainType *terrain = terrain_types.findTerrain(AsciiString(name));
	found = terrain != nullptr;
	if (!found) {
		texture.clear();
		terrain_class = TERRAIN_NONE;
		return;
	}

	texture = terrain->getTexture().str();
	terrain_class = terrain->getClass();
}

std::size_t count_terrain_roads(TerrainRoadCollection &terrain_roads)
{
	std::size_t count = 0;
	for (TerrainRoadType *road = terrain_roads.firstRoad(); road != nullptr;
			road = terrain_roads.nextRoad(road)) {
		++count;
	}
	return count;
}

std::size_t count_terrain_bridges(TerrainRoadCollection &terrain_roads)
{
	std::size_t count = 0;
	for (TerrainRoadType *bridge = terrain_roads.firstBridge(); bridge != nullptr;
			bridge = terrain_roads.nextBridge(bridge)) {
		++count;
	}
	return count;
}

void inspect_terrain_road_entry(
	TerrainRoadCollection &terrain_roads,
	const char *name,
	bool &found,
	std::string &texture,
	float &width,
	float &width_in_texture)
{
	TerrainRoadType *road = terrain_roads.findRoad(AsciiString(name));
	found = road != nullptr;
	if (!found) {
		texture.clear();
		width = 0.0f;
		width_in_texture = 0.0f;
		return;
	}

	texture = road->getTexture().str();
	width = road->getRoadWidth();
	width_in_texture = road->getRoadWidthInTexture();
}

std::size_t count_mapped_images(ImageCollection &images)
{
	std::size_t count = 0;
	while (images.Enum(static_cast<unsigned>(count)) != nullptr) {
		++count;
	}
	return count;
}

std::size_t count_mapped_image_files(FileSystem &file_system, std::size_t &bytes)
{
	FilenameList files;
	AsciiString mapped_images_dir(MAPPED_IMAGES_DIR);
	mapped_images_dir.concat('\\');
	file_system.getFileListInDirectory(
		mapped_images_dir, AsciiString("*.ini"), files, TRUE);

	bytes = 0;
	for (FilenameListIter it = files.begin(); it != files.end(); ++it) {
		FileInfo file_info = {};
		if (file_system.getFileInfo(*it, &file_info) &&
				file_info.sizeHigh == 0 &&
				file_info.sizeLow > 0) {
			bytes += static_cast<std::size_t>(file_info.sizeLow);
		}
	}

	return files.size();
}

void inspect_mapped_image(
	ImageCollection &images,
	const char *name,
	bool &found,
	std::string &texture,
	int &texture_width,
	int &texture_height,
	int &image_width,
	int &image_height,
	unsigned int &status,
	float *uv_lo_x = nullptr,
	float *uv_lo_y = nullptr,
	float *uv_hi_x = nullptr,
	float *uv_hi_y = nullptr)
{
	const Image *image = images.findImageByName(AsciiString(name));
	found = image != nullptr;
	if (image == nullptr) {
		texture.clear();
		texture_width = 0;
		texture_height = 0;
		image_width = 0;
		image_height = 0;
		status = 0;
		if (uv_lo_x != nullptr) {
			*uv_lo_x = 0.0f;
		}
		if (uv_lo_y != nullptr) {
			*uv_lo_y = 0.0f;
		}
		if (uv_hi_x != nullptr) {
			*uv_hi_x = 0.0f;
		}
		if (uv_hi_y != nullptr) {
			*uv_hi_y = 0.0f;
		}
		return;
	}

	const ICoord2D *texture_size = image->getTextureSize();
	const Region2D *uv = image->getUV();
	texture = image->getFilename().str();
	texture_width = texture_size->x;
	texture_height = texture_size->y;
	image_width = image->getImageWidth();
	image_height = image->getImageHeight();
	status = image->getStatus();
	if (uv_lo_x != nullptr) {
		*uv_lo_x = uv->lo.x;
	}
	if (uv_lo_y != nullptr) {
		*uv_lo_y = uv->lo.y;
	}
	if (uv_hi_x != nullptr) {
		*uv_hi_x = uv->hi.x;
	}
	if (uv_hi_y != nullptr) {
		*uv_hi_y = uv->hi.y;
	}
}

std::string image_name(const Image *image)
{
	return image != nullptr ? image->getName().str() : "";
}

const ControlBarSchemeImage *first_scheme_layer_image(
	const ControlBarScheme *scheme,
	int layer)
{
	if (scheme == nullptr || layer < 0 || layer >= MAX_CONTROL_BAR_SCHEME_IMAGE_LAYERS ||
			scheme->m_layer[layer].empty()) {
		return nullptr;
	}

	return scheme->m_layer[layer].front();
}

void inspect_default_control_bar_scheme(
	ControlBarSchemeManager &manager,
	RealControlBarSchemeIniProbeResult &result)
{
	const ControlBarScheme *scheme = manager.findControlBarScheme(AsciiString("Default"));
	result.default_found = scheme != nullptr;
	if (scheme == nullptr) {
		return;
	}

	result.default_queue_image = image_name(scheme->m_buttonQueueImage);
	result.default_right_hud_image = image_name(scheme->m_rightHUDImage);
	const ControlBarSchemeImage *base_image = first_scheme_layer_image(scheme, 4);
	if (base_image != nullptr) {
		result.default_base_image = image_name(base_image->m_image);
		result.default_base_layer = base_image->m_layer;
		result.default_base_width = base_image->m_size.x;
		result.default_base_height = base_image->m_size.y;
	}
}

void inspect_control_bar_scheme_sample(
	ControlBarSchemeManager &manager,
	const char *name,
	bool &found,
	std::string &side,
	std::string &right_hud_image,
	std::string &command_marker_image,
	std::string &power_purchase_image,
	std::string &base_image_name,
	std::string *queue_image = nullptr,
	std::string *gen_arrow_image = nullptr,
	int *screen_x = nullptr,
	int *screen_y = nullptr,
	int *base_layer = nullptr,
	int *base_x = nullptr,
	int *base_y = nullptr,
	int *base_width = nullptr,
	int *base_height = nullptr)
{
	const ControlBarScheme *scheme = manager.findControlBarScheme(AsciiString(name));
	found = scheme != nullptr;
	if (scheme == nullptr) {
		return;
	}

	side = scheme->m_side.str();
	right_hud_image = image_name(scheme->m_rightHUDImage);
	command_marker_image = image_name(scheme->m_commandMarkerImage);
	power_purchase_image = image_name(scheme->m_powerPurchaseImage);
	if (queue_image != nullptr) {
		*queue_image = image_name(scheme->m_buttonQueueImage);
	}
	if (gen_arrow_image != nullptr) {
		*gen_arrow_image = image_name(scheme->m_genArrow);
	}
	if (screen_x != nullptr) {
		*screen_x = scheme->m_ScreenCreationRes.x;
	}
	if (screen_y != nullptr) {
		*screen_y = scheme->m_ScreenCreationRes.y;
	}

	const ControlBarSchemeImage *base_image = first_scheme_layer_image(scheme, 4);
	if (base_image == nullptr) {
		return;
	}

	base_image_name = image_name(base_image->m_image);
	if (base_layer != nullptr) {
		*base_layer = base_image->m_layer;
	}
	if (base_x != nullptr) {
		*base_x = base_image->m_position.x;
	}
	if (base_y != nullptr) {
		*base_y = base_image->m_position.y;
	}
	if (base_width != nullptr) {
		*base_width = base_image->m_size.x;
	}
	if (base_height != nullptr) {
		*base_height = base_image->m_size.y;
	}
}

std::size_t count_upgrade_templates(UpgradeCenter &upgrade_center)
{
	std::size_t count = 0;
	for (UpgradeTemplate *upgrade = upgrade_center.firstUpgradeTemplate(); upgrade != nullptr;
			upgrade = upgrade->friend_getNext()) {
		++count;
	}
	return count;
}

void inspect_upgrade_entry(
	UpgradeCenter &upgrade_center,
	const char *name,
	bool &found,
	std::string &display_name,
	int &type,
	int &build_frames,
	int &cost,
	std::string &research_sound,
	int &academy_classification)
{
	const UpgradeTemplate *upgrade = upgrade_center.findUpgrade(AsciiString(name));
	found = upgrade != nullptr;
	if (upgrade == nullptr) {
		display_name.clear();
		type = 0;
		build_frames = 0;
		cost = 0;
		research_sound.clear();
		academy_classification = 0;
		return;
	}

	display_name = upgrade->getDisplayNameLabel().str();
	type = static_cast<int>(upgrade->getUpgradeType());
	build_frames = upgrade->calcTimeToBuild(nullptr);
	cost = upgrade->calcCostToBuild(nullptr);
	research_sound = upgrade->getResearchCompleteSound()->getEventName().str();
	academy_classification = static_cast<int>(upgrade->getAcademyClassificationType());
}

std::size_t count_command_buttons(ControlBar &control_bar)
{
	std::size_t count = 0;
	for (const CommandButton *button = control_bar.getCommandButtons(); button != nullptr;
			button = button->getNext()) {
		++count;
	}
	return count;
}

void inspect_flash_bang_upgrade_button(ControlBar &control_bar, RealCommandButtonIniProbeResult &result)
{
	const CommandButton *button =
		control_bar.findCommandButton(AsciiString("Command_UpgradeAmericaRangerFlashBangGrenade"));
	result.flash_bang_upgrade_found = button != nullptr;
	if (button == nullptr) {
		return;
	}

	const UpgradeTemplate *upgrade = button->getUpgradeTemplate();
	result.flash_bang_upgrade_command = static_cast<int>(button->getCommandType());
	result.flash_bang_upgrade_border =
		static_cast<int>(button->getCommandButtonMappedBorderType());
	result.flash_bang_upgrade_name = upgrade != nullptr ? upgrade->getUpgradeName().str() : "";
	result.flash_bang_upgrade_label = button->getTextLabel().str();
	result.flash_bang_upgrade_description = button->getDescriptionLabel().str();
}

void inspect_ranger_capture_button(ControlBar &control_bar, RealCommandButtonIniProbeResult &result)
{
	const CommandButton *button =
		control_bar.findCommandButton(AsciiString("Command_AmericaRangerCaptureBuilding"));
	result.ranger_capture_found = button != nullptr;
	if (button == nullptr) {
		return;
	}

	const UpgradeTemplate *upgrade = button->getUpgradeTemplate();
	const SpecialPowerTemplate *special_power = button->getSpecialPowerTemplate();
	result.ranger_capture_command = static_cast<int>(button->getCommandType());
	result.ranger_capture_options = button->getOptions();
	result.ranger_capture_border = static_cast<int>(button->getCommandButtonMappedBorderType());
	result.ranger_capture_upgrade_name = upgrade != nullptr ? upgrade->getUpgradeName().str() : "";
	result.ranger_capture_special_power_name =
		special_power != nullptr ? special_power->getName().str() : "";
	result.ranger_capture_label = button->getTextLabel().str();
	result.ranger_capture_description = button->getDescriptionLabel().str();
	result.ranger_capture_cursor = button->getCursorName().str();
	result.ranger_capture_invalid_cursor = button->getInvalidCursorName().str();
	result.ranger_capture_has_enemy_target =
		(button->getOptions() & NEED_TARGET_ENEMY_OBJECT) != 0;
	result.ranger_capture_has_neutral_target =
		(button->getOptions() & NEED_TARGET_NEUTRAL_OBJECT) != 0;
	result.ranger_capture_has_multi_select =
		(button->getOptions() & OK_FOR_MULTI_SELECT) != 0;
	result.ranger_capture_has_need_upgrade =
		(button->getOptions() & NEED_UPGRADE) != 0;
	result.ranger_capture_has_need_special_power_science =
		(button->getOptions() & NEED_SPECIAL_POWER_SCIENCE) != 0;
}

void inspect_flash_bang_switch_button(ControlBar &control_bar, RealCommandButtonIniProbeResult &result)
{
	const CommandButton *button =
		control_bar.findCommandButton(AsciiString("Command_AmericaRangerSwitchToFlagBangGrenades"));
	result.flash_bang_switch_found = button != nullptr;
	if (button == nullptr) {
		return;
	}

	const UpgradeTemplate *upgrade = button->getUpgradeTemplate();
	result.flash_bang_switch_command = static_cast<int>(button->getCommandType());
	result.flash_bang_switch_options = button->getOptions();
	result.flash_bang_switch_weapon_slot = static_cast<int>(button->getWeaponSlot());
	result.flash_bang_switch_border = static_cast<int>(button->getCommandButtonMappedBorderType());
	result.flash_bang_switch_upgrade_name =
		upgrade != nullptr ? upgrade->getUpgradeName().str() : "";
	result.flash_bang_switch_label = button->getTextLabel().str();
	result.flash_bang_switch_description = button->getDescriptionLabel().str();
	result.flash_bang_switch_has_check_like =
		(button->getOptions() & CHECK_LIKE) != 0;
	result.flash_bang_switch_has_multi_select =
		(button->getOptions() & OK_FOR_MULTI_SELECT) != 0;
	result.flash_bang_switch_has_need_upgrade =
		(button->getOptions() & NEED_UPGRADE) != 0;
}

bool command_buttons_have_valid_special_power_options(ControlBar &control_bar)
{
	for (const CommandButton *button = control_bar.getCommandButtons(); button != nullptr;
			button = button->getNext()) {
		const bool has_special_power = button->getSpecialPowerTemplate() != nullptr;
		const bool needs_special_power_science =
			(button->getOptions() & NEED_SPECIAL_POWER_SCIENCE) != 0;
		if (has_special_power != needs_special_power_science) {
			return false;
		}
	}
	return true;
}

void inspect_command_set_slot(
	const CommandSet &command_set,
	Int index,
	std::string &name,
	int &command,
	int *weapon_slot,
	std::string *special_power_name,
	std::string *upgrade_name)
{
	const CommandButton *button = command_set.getCommandButton(index);
	if (button == nullptr) {
		name.clear();
		command = 0;
		if (weapon_slot != nullptr) {
			*weapon_slot = 0;
		}
		if (special_power_name != nullptr) {
			special_power_name->clear();
		}
		if (upgrade_name != nullptr) {
			upgrade_name->clear();
		}
		return;
	}

	const SpecialPowerTemplate *special_power = button->getSpecialPowerTemplate();
	const UpgradeTemplate *upgrade = button->getUpgradeTemplate();
	name = button->getName().str();
	command = static_cast<int>(button->getCommandType());
	if (weapon_slot != nullptr) {
		*weapon_slot = static_cast<int>(button->getWeaponSlot());
	}
	if (special_power_name != nullptr) {
		*special_power_name = special_power != nullptr ? special_power->getName().str() : "";
	}
	if (upgrade_name != nullptr) {
		*upgrade_name = upgrade != nullptr ? upgrade->getUpgradeName().str() : "";
	}
}

void inspect_ranger_command_set(ControlBar &control_bar, RealCommandSetIniProbeResult &result)
{
	const CommandSet *command_set =
		control_bar.findCommandSet(AsciiString("AmericaInfantryRangerCommandSet"));
	result.ranger_set_found = command_set != nullptr;
	result.command_set_count = result.ranger_set_found ? 1U : 0U;
	if (command_set == nullptr) {
		return;
	}

	inspect_command_set_slot(
		*command_set,
		0,
		result.ranger_slot1,
		result.ranger_slot1_command,
		nullptr,
		&result.ranger_slot1_special_power,
		&result.ranger_slot1_upgrade);
	inspect_command_set_slot(
		*command_set,
		1,
		result.ranger_slot2,
		result.ranger_slot2_command,
		&result.ranger_slot2_weapon_slot,
		nullptr,
		nullptr);
	inspect_command_set_slot(
		*command_set,
		3,
		result.ranger_slot4,
		result.ranger_slot4_command,
		&result.ranger_slot4_weapon_slot,
		nullptr,
		&result.ranger_slot4_upgrade);
	inspect_command_set_slot(
		*command_set,
		10,
		result.ranger_slot11,
		result.ranger_slot11_command,
		nullptr,
		nullptr,
		nullptr);
	inspect_command_set_slot(
		*command_set,
		12,
		result.ranger_slot13,
		result.ranger_slot13_command,
		nullptr,
		nullptr,
		nullptr);
	inspect_command_set_slot(
		*command_set,
		13,
		result.ranger_slot14,
		result.ranger_slot14_command,
		nullptr,
		nullptr,
		nullptr);
}
}

RealGameDataIniProbeResult probe_original_game_data_ini_load(const char *archive_path)
{
	RealGameDataIniProbeResult result;
	result.attempted = true;
	result.source = "GameEngine/Common/INI.cpp::load";
	result.archive_path = archive_path != nullptr ? archive_path : "";

	AsciiString archive_directory;
	AsciiString archive_mask;
	split_archive_path(archive_path, archive_directory, archive_mask);
	if (archive_mask.isEmpty()) {
		return result;
	}

	initMemoryManager();

	FileSystem *old_file_system = TheFileSystem;
	LocalFileSystem *old_local_file_system = TheLocalFileSystem;
	ArchiveFileSystem *old_archive_file_system = TheArchiveFileSystem;
	GlobalData *old_global_data = TheWritableGlobalData;

	Win32LocalFileSystem local_file_system;
	Win32BIGFileSystem archive_file_system;
	FileSystem file_system;
	GlobalData *global_data = nullptr;

	try {
		TheLocalFileSystem = &local_file_system;
		TheArchiveFileSystem = &archive_file_system;
		TheFileSystem = &file_system;

		result.loaded_archives = archive_file_system.loadBigFilesFromDirectory(archive_directory, archive_mask);
		if (result.loaded_archives) {
			FileInfo file_info = {};
			result.file_exists =
				archive_file_system.getFileInfo(AsciiString(GAME_DATA_INI_PATH), &file_info) &&
				file_info.sizeHigh == 0 &&
				file_info.sizeLow > 0;
			result.bytes = result.file_exists ? static_cast<std::size_t>(file_info.sizeLow) : 0U;

			if (result.file_exists) {
				global_data = NEW GlobalData;
				TheWritableGlobalData = global_data;

				INI ini;
				ini.load(AsciiString(GAME_DATA_INI_PATH), INI_LOAD_OVERWRITE, nullptr);
				result.original_ini_load = true;

				result.shell_map_name = global_data->m_shellMapName.str();
				result.use_fps_limit = global_data->m_useFpsLimit;
				result.frames_per_second_limit = global_data->m_framesPerSecondLimit;
				result.max_shell_screens = global_data->m_maxShellScreens;
				result.use_cloud_map = global_data->m_useCloudMap;
				result.default_structure_rubble_height = global_data->m_defaultStructureRubbleHeight;
				result.group_select_volume_base = global_data->m_groupSelectVolumeBase;
				result.max_particle_count = global_data->m_maxParticleCount;
				result.parsed_fields = count_verified_fields(result);
				result.ok =
					result.bytes > 10000 &&
					result.parsed_fields == 8 &&
					result.original_ini_load;
			}
		}
	} catch (...) {
		result.ok = false;
	}

	if (global_data != nullptr) {
		delete global_data;
	}

	TheWritableGlobalData = old_global_data;
	TheFileSystem = old_file_system;
	TheArchiveFileSystem = old_archive_file_system;
	TheLocalFileSystem = old_local_file_system;

	shutdownMemoryManager();

	return result;
}

RealArmorIniProbeResult probe_original_armor_ini_load(const char *archive_path)
{
	RealArmorIniProbeResult result;
	result.attempted = true;
	result.source = "GameEngine/Common/INI.cpp::load + GameLogic/Object/Armor.cpp";
	result.archive_path = archive_path != nullptr ? archive_path : "";

	AsciiString archive_directory;
	AsciiString archive_mask;
	split_archive_path(archive_path, archive_directory, archive_mask);
	if (archive_mask.isEmpty()) {
		return result;
	}

	initMemoryManager();

	FileSystem *old_file_system = TheFileSystem;
	LocalFileSystem *old_local_file_system = TheLocalFileSystem;
	ArchiveFileSystem *old_archive_file_system = TheArchiveFileSystem;
	NameKeyGenerator *old_name_key_generator = TheNameKeyGenerator;
	ArmorStore *old_armor_store = TheArmorStore;

	Win32LocalFileSystem local_file_system;
	Win32BIGFileSystem archive_file_system;
	FileSystem file_system;
	NameKeyGenerator *name_key_generator = nullptr;
	ArmorStore *armor_store = nullptr;

	try {
		TheLocalFileSystem = &local_file_system;
		TheArchiveFileSystem = &archive_file_system;
		TheFileSystem = &file_system;

		result.loaded_archives = archive_file_system.loadBigFilesFromDirectory(archive_directory, archive_mask);
		if (result.loaded_archives) {
			FileInfo file_info = {};
			result.file_exists =
				archive_file_system.getFileInfo(AsciiString(ARMOR_INI_PATH), &file_info) &&
				file_info.sizeHigh == 0 &&
				file_info.sizeLow > 0;
			result.bytes = result.file_exists ? static_cast<std::size_t>(file_info.sizeLow) : 0U;

			if (result.file_exists) {
				name_key_generator = NEW NameKeyGenerator;
				TheNameKeyGenerator = name_key_generator;
				name_key_generator->init();
				result.name_key_generator_loaded = true;

				armor_store = NEW ArmorStore;
				TheArmorStore = armor_store;

				INI ini;
				ini.load(AsciiString(ARMOR_INI_PATH), INI_LOAD_OVERWRITE, nullptr);
				result.original_ini_load = true;

				const ArmorTemplate *no_armor = armor_store->findArmorTemplate("NoArmor");
				const ArmorTemplate *human_armor = armor_store->findArmorTemplate("HumanArmor");
				const ArmorTemplate *tank_armor = armor_store->findArmorTemplate("TankArmor");

				result.no_armor_found = no_armor != nullptr;
				result.human_armor_found = human_armor != nullptr;
				result.tank_armor_found = tank_armor != nullptr;

				if (no_armor != nullptr) {
					result.no_armor_explosion_damage =
						no_armor->adjustDamage(DAMAGE_EXPLOSION, 100.0f);
					result.no_armor_hazard_cleanup_damage =
						no_armor->adjustDamage(DAMAGE_HAZARD_CLEANUP, 100.0f);
				}
				if (human_armor != nullptr) {
					result.human_crush_damage =
						human_armor->adjustDamage(DAMAGE_CRUSH, 100.0f);
					result.human_armor_piercing_damage =
						human_armor->adjustDamage(DAMAGE_ARMOR_PIERCING, 100.0f);
					result.human_flame_damage =
						human_armor->adjustDamage(DAMAGE_FLAME, 100.0f);
				}
				if (tank_armor != nullptr) {
					result.tank_small_arms_damage =
						tank_armor->adjustDamage(DAMAGE_SMALL_ARMS, 100.0f);
					result.tank_radiation_damage =
						tank_armor->adjustDamage(DAMAGE_RADIATION, 100.0f);
					result.tank_microwave_damage =
						tank_armor->adjustDamage(DAMAGE_MICROWAVE, 100.0f);
				}

				result.parsed_fields = count_verified_fields(result);
				result.ok =
					result.bytes > 50000 &&
					result.name_key_generator_loaded &&
					result.original_ini_load &&
					result.parsed_fields == 11;
			}
		}
	} catch (...) {
		result.ok = false;
	}

	TheArmorStore = old_armor_store;
	TheNameKeyGenerator = old_name_key_generator;
	TheFileSystem = old_file_system;
	TheArchiveFileSystem = old_archive_file_system;
	TheLocalFileSystem = old_local_file_system;

	if (armor_store != nullptr) {
		delete armor_store;
	}
	if (name_key_generator != nullptr) {
		delete name_key_generator;
	}

	shutdownMemoryManager();

	return result;
}

RealDamageFXIniProbeResult probe_original_damage_fx_ini_load(const char *archive_path)
{
	RealDamageFXIniProbeResult result;
	result.attempted = true;
	result.source =
		"GameEngine/Common/INI.cpp::load + INIDamageFX.cpp + DamageFX.cpp + focused FXList lookup";
	result.archive_path = archive_path != nullptr ? archive_path : "";

	AsciiString archive_directory;
	AsciiString archive_mask;
	split_archive_path(archive_path, archive_directory, archive_mask);
	if (archive_mask.isEmpty()) {
		return result;
	}

	initMemoryManager();

	FileSystem *old_file_system = TheFileSystem;
	LocalFileSystem *old_local_file_system = TheLocalFileSystem;
	ArchiveFileSystem *old_archive_file_system = TheArchiveFileSystem;
	NameKeyGenerator *old_name_key_generator = TheNameKeyGenerator;
	FXListStore *old_fx_list_store = TheFXListStore;
	DamageFXStore *old_damage_fx_store = TheDamageFXStore;

	Win32LocalFileSystem local_file_system;
	Win32BIGFileSystem archive_file_system;
	FileSystem file_system;
	NameKeyGenerator *name_key_generator = nullptr;
	FXListStore *fx_list_store = nullptr;
	DamageFXStore *damage_fx_store = nullptr;

	try {
		TheLocalFileSystem = &local_file_system;
		TheArchiveFileSystem = &archive_file_system;
		TheFileSystem = &file_system;

		result.loaded_archives =
			archive_file_system.loadBigFilesFromDirectory(archive_directory, archive_mask);
		if (result.loaded_archives) {
			FileInfo file_info = {};
			result.file_exists =
				archive_file_system.getFileInfo(AsciiString(DAMAGE_FX_INI_PATH), &file_info) &&
				file_info.sizeHigh == 0 &&
				file_info.sizeLow > 0;
			result.bytes = result.file_exists ? static_cast<std::size_t>(file_info.sizeLow) : 0U;

			if (result.file_exists) {
				name_key_generator = NEW NameKeyGenerator;
				TheNameKeyGenerator = name_key_generator;
				name_key_generator->init();
				result.name_key_generator_loaded = true;

				fx_list_store = NEW FXListStore;
				TheFXListStore = fx_list_store;
				fx_list_store->init();
				result.fx_list_store_loaded = true;

				damage_fx_store = NEW DamageFXStore;
				TheDamageFXStore = damage_fx_store;
				damage_fx_store->init();
				result.damage_fx_store_loaded = true;

				initDamageTypeFlags();

				INI ini;
				ini.load(AsciiString(DAMAGE_FX_INI_PATH), INI_LOAD_OVERWRITE, nullptr);
				result.original_ini_load = true;

				const DamageFX *default_damage_fx =
					damage_fx_store->findDamageFX(AsciiString("DefaultDamageFX"));
				const DamageFX *tank_damage_fx =
					damage_fx_store->findDamageFX(AsciiString("TankDamageFX"));
				const DamageFX *small_tank_damage_fx =
					damage_fx_store->findDamageFX(AsciiString("SmallTankDamageFX"));
				const DamageFX *structure_damage_fx =
					damage_fx_store->findDamageFX(AsciiString("StructureDamageFX"));
				const DamageFX *infantry_damage_fx =
					damage_fx_store->findDamageFX(AsciiString("InfantryDamageFX"));

				result.default_damage_fx_found = default_damage_fx != nullptr;
				result.tank_damage_fx_found = tank_damage_fx != nullptr;
				result.small_tank_damage_fx_found = small_tank_damage_fx != nullptr;
				result.structure_damage_fx_found = structure_damage_fx != nullptr;
				result.infantry_damage_fx_found = infantry_damage_fx != nullptr;

				if (default_damage_fx != nullptr) {
					result.default_explosion_throttle =
						default_damage_fx->getDamageFXThrottleTime(DAMAGE_EXPLOSION, nullptr);
				}
				if (tank_damage_fx != nullptr) {
					result.tank_small_arms_throttle =
						tank_damage_fx->getDamageFXThrottleTime(DAMAGE_SMALL_ARMS, nullptr);
				}
				if (small_tank_damage_fx != nullptr) {
					result.small_tank_comanche_throttle =
						small_tank_damage_fx->getDamageFXThrottleTime(
							DAMAGE_COMANCHE_VULCAN,
							nullptr);
				}
				if (structure_damage_fx != nullptr) {
					result.structure_flame_throttle =
						structure_damage_fx->getDamageFXThrottleTime(DAMAGE_FLAME, nullptr);
				}
				if (infantry_damage_fx != nullptr) {
					result.infantry_sniper_throttle =
						infantry_damage_fx->getDamageFXThrottleTime(DAMAGE_SNIPER, nullptr);
				}

				result.parsed_fields = count_verified_fields(result);
				result.ok =
					result.bytes > 10000 &&
					result.name_key_generator_loaded &&
					result.fx_list_store_loaded &&
					result.damage_fx_store_loaded &&
					result.original_ini_load &&
					result.parsed_fields == 10;
			}
		}
	} catch (...) {
		result.ok = false;
	}

	TheDamageFXStore = old_damage_fx_store;
	TheFXListStore = old_fx_list_store;
	TheNameKeyGenerator = old_name_key_generator;
	TheFileSystem = old_file_system;
	TheArchiveFileSystem = old_archive_file_system;
	TheLocalFileSystem = old_local_file_system;

	if (damage_fx_store != nullptr) {
		delete damage_fx_store;
	}
	if (fx_list_store != nullptr) {
		delete fx_list_store;
	}
	if (name_key_generator != nullptr) {
		delete name_key_generator;
	}

	shutdownMemoryManager();

	return result;
}

RealFXListIniProbeResult probe_original_fx_list_ini_load(const char *archive_path)
{
	RealFXListIniProbeResult result;
	result.attempted = true;
	result.source = "GameEngine/Common/INI.cpp::load + GameClient/FXList.cpp";
	result.archive_path = archive_path != nullptr ? archive_path : "";

	AsciiString archive_directory;
	AsciiString archive_mask;
	split_archive_path(archive_path, archive_directory, archive_mask);
	if (archive_mask.isEmpty()) {
		return result;
	}

	initMemoryManager();

	FileSystem *old_file_system = TheFileSystem;
	LocalFileSystem *old_local_file_system = TheLocalFileSystem;
	ArchiveFileSystem *old_archive_file_system = TheArchiveFileSystem;
	NameKeyGenerator *old_name_key_generator = TheNameKeyGenerator;
	FXListStore *old_fx_list_store = TheFXListStore;

	Win32LocalFileSystem local_file_system;
	Win32BIGFileSystem archive_file_system;
	FileSystem file_system;
	NameKeyGenerator *name_key_generator = nullptr;
	FXListStore *fx_list_store = nullptr;

	try {
		TheLocalFileSystem = &local_file_system;
		TheArchiveFileSystem = &archive_file_system;
		TheFileSystem = &file_system;

		result.loaded_archives =
			archive_file_system.loadBigFilesFromDirectory(archive_directory, archive_mask);
		if (result.loaded_archives) {
			FileInfo file_info = {};
			result.file_exists =
				archive_file_system.getFileInfo(AsciiString(FX_LIST_INI_PATH), &file_info) &&
				file_info.sizeHigh == 0 &&
				file_info.sizeLow > 0;
			result.bytes = result.file_exists ?
				static_cast<std::size_t>(file_info.sizeLow) : 0U;

			if (result.file_exists) {
				name_key_generator = NEW NameKeyGenerator;
				TheNameKeyGenerator = name_key_generator;
				name_key_generator->init();
				result.name_key_generator_loaded = true;

				fx_list_store = NEW FXListStore;
				TheFXListStore = fx_list_store;
				fx_list_store->init();
				result.fx_list_store_loaded = true;

				INI ini;
				ini.load(AsciiString(FX_LIST_INI_PATH), INI_LOAD_OVERWRITE, nullptr);
				result.original_ini_load = true;
				result.list_count =
					static_cast<std::size_t>(fx_list_store->wasmGetListCount());

				const FXList *toxin_shell =
					fx_list_store->findFXList("WeaponFX_ToxinShellWeapon");
				result.toxin_shell_found = toxin_shell != nullptr;
				result.toxin_shell_nuggets = toxin_shell != nullptr ?
					static_cast<std::size_t>(toxin_shell->wasmGetNuggetCount()) : 0U;

				const FXList *car_crusher =
					fx_list_store->findFXList("FX_CarOverlappedByCrusher");
				result.car_crusher_found = car_crusher != nullptr;
				result.car_crusher_nuggets = car_crusher != nullptr ?
					static_cast<std::size_t>(car_crusher->wasmGetNuggetCount()) : 0U;

				const FXList *damage_tank_struck =
					fx_list_store->findFXList("FX_DamageTankStruck");
				result.damage_tank_struck_found = damage_tank_struck != nullptr;
				result.damage_tank_struck_nuggets = damage_tank_struck != nullptr ?
					static_cast<std::size_t>(
						damage_tank_struck->wasmGetNuggetCount()) : 0U;

				const FXList *moab_blast =
					fx_list_store->findFXList("WeaponFX_MOAB_Blast");
				result.moab_blast_found = moab_blast != nullptr;
				result.moab_blast_nuggets = moab_blast != nullptr ?
					static_cast<std::size_t>(moab_blast->wasmGetNuggetCount()) : 0U;

				const FXList *bunker_buster =
					fx_list_store->findFXList("FX_BunkerBusterExplosion");
				result.bunker_buster_found = bunker_buster != nullptr;
				result.bunker_buster_nuggets = bunker_buster != nullptr ?
					static_cast<std::size_t>(bunker_buster->wasmGetNuggetCount()) : 0U;

				result.parsed_fields = count_verified_fields(result);
				result.ok =
					result.bytes > 100000 &&
					result.name_key_generator_loaded &&
					result.fx_list_store_loaded &&
					result.original_ini_load &&
					result.parsed_fields == 11;
			}
		}
	} catch (...) {
		result.ok = false;
	}

	TheFXListStore = old_fx_list_store;
	TheNameKeyGenerator = old_name_key_generator;
	TheFileSystem = old_file_system;
	TheArchiveFileSystem = old_archive_file_system;
	TheLocalFileSystem = old_local_file_system;

	if (fx_list_store != nullptr) {
		delete fx_list_store;
	}
	if (name_key_generator != nullptr) {
		delete name_key_generator;
	}

	shutdownMemoryManager();

	return result;
}

RealWeaponIniProbeResult probe_original_weapon_ini_load(const char *archive_path)
{
	RealWeaponIniProbeResult result;
	result.attempted = true;
	result.source =
		"GameEngine/Common/INI.cpp::load + INIParticleSys.cpp + INIWeapon.cpp + Weapon.cpp";
	result.archive_path = archive_path != nullptr ? archive_path : "";

	AsciiString archive_directory;
	AsciiString archive_mask;
	split_archive_path(archive_path, archive_directory, archive_mask);
	if (archive_mask.isEmpty()) {
		return result;
	}

	initMemoryManager();

	FileSystem *old_file_system = TheFileSystem;
	LocalFileSystem *old_local_file_system = TheLocalFileSystem;
	ArchiveFileSystem *old_archive_file_system = TheArchiveFileSystem;
	NameKeyGenerator *old_name_key_generator = TheNameKeyGenerator;
	FXListStore *old_fx_list_store = TheFXListStore;
	ParticleSystemManager *old_particle_system_manager = TheParticleSystemManager;
	WeaponStore *old_weapon_store = TheWeaponStore;

	Win32LocalFileSystem local_file_system;
	Win32BIGFileSystem archive_file_system;
	FileSystem file_system;
	NameKeyGenerator *name_key_generator = nullptr;
	FXListStore *fx_list_store = nullptr;
	ProbeParticleSystemManager *particle_system_manager = nullptr;
	WeaponStore *weapon_store = nullptr;

	try {
		TheLocalFileSystem = &local_file_system;
		TheArchiveFileSystem = &archive_file_system;
		TheFileSystem = &file_system;

		result.loaded_archives =
			archive_file_system.loadBigFilesFromDirectory(archive_directory, archive_mask);
		if (result.loaded_archives) {
			FileInfo weapon_file_info = {};
			result.file_exists =
				archive_file_system.getFileInfo(AsciiString(WEAPON_INI_PATH), &weapon_file_info) &&
				weapon_file_info.sizeHigh == 0 &&
				weapon_file_info.sizeLow > 0;
			result.bytes =
				result.file_exists ? static_cast<std::size_t>(weapon_file_info.sizeLow) : 0U;

			FileInfo particle_file_info = {};
			result.particle_file_exists =
				archive_file_system.getFileInfo(
					AsciiString(PARTICLE_SYSTEM_INI_PATH),
					&particle_file_info) &&
				particle_file_info.sizeHigh == 0 &&
				particle_file_info.sizeLow > 0;
			result.particle_bytes =
				result.particle_file_exists ?
					static_cast<std::size_t>(particle_file_info.sizeLow) :
					0U;

			if (result.file_exists && result.particle_file_exists) {
				name_key_generator = NEW NameKeyGenerator;
				TheNameKeyGenerator = name_key_generator;
				name_key_generator->init();
				result.name_key_generator_loaded = true;

				fx_list_store = NEW FXListStore;
				TheFXListStore = fx_list_store;
				fx_list_store->init();
				result.fx_list_store_loaded = true;

				particle_system_manager = NEW ProbeParticleSystemManager;
				TheParticleSystemManager = particle_system_manager;
				particle_system_manager->init();
				result.particle_system_manager_loaded = true;
				result.particle_original_ini_load = true;
				result.particle_template_count =
					static_cast<std::size_t>(std::distance(
						particle_system_manager->beginParticleSystemTemplate(),
						particle_system_manager->endParticleSystemTemplate()));
				result.tomahawk_exhaust_template_found =
					particle_system_manager->findTemplate("TomahawkMissileExhaust") != nullptr;
				result.heroic_tomahawk_exhaust_template_found =
					particle_system_manager->findTemplate("HeroicTomahawkMissileExhaust") != nullptr;

				weapon_store = NEW WeaponStore;
				TheWeaponStore = weapon_store;
				weapon_store->init();
				result.weapon_store_loaded = true;

				initDamageTypeFlags();

				INI ini;
				ini.load(AsciiString(WEAPON_INI_PATH), INI_LOAD_OVERWRITE, nullptr);
				result.original_ini_load = true;

				WeaponBonus base_bonus;
				const WeaponTemplate *ranger =
					weapon_store->findWeaponTemplate("RangerAdvancedCombatRifle");
				const WeaponTemplate *crusader =
					weapon_store->findWeaponTemplate("CrusaderTankGun");
				const WeaponTemplate *tomahawk =
					weapon_store->findWeaponTemplate("TomahawkMissileWeapon");

				result.ranger_found = ranger != nullptr;
				result.crusader_found = crusader != nullptr;
				result.tomahawk_found = tomahawk != nullptr;

				if (ranger != nullptr) {
					result.ranger_primary_damage = ranger->getPrimaryDamage(base_bonus);
					result.ranger_attack_range = ranger->getUnmodifiedAttackRange();
					result.ranger_delay_frames = ranger->getDelayBetweenShots(base_bonus);
					result.ranger_clip_size = ranger->getClipSize();
					result.ranger_clip_reload_frames = ranger->getClipReloadTime(base_bonus);
					result.ranger_damage_type = ranger->getDamageType();
					result.ranger_death_type = ranger->getDeathType();
					result.ranger_fire_sound = ranger->getFireSound().getEventName().str();
				}

				if (crusader != nullptr) {
					result.crusader_primary_damage = crusader->getPrimaryDamage(base_bonus);
					result.crusader_primary_damage_radius =
						crusader->getPrimaryDamageRadius(base_bonus);
					result.crusader_attack_range = crusader->getUnmodifiedAttackRange();
					result.crusader_delay_frames = crusader->getDelayBetweenShots(base_bonus);
					result.crusader_clip_size = crusader->getClipSize();
					result.crusader_damage_type = crusader->getDamageType();
					result.crusader_death_type = crusader->getDeathType();
					result.crusader_fire_sound = crusader->getFireSound().getEventName().str();
				}

				if (tomahawk != nullptr) {
					result.tomahawk_primary_damage = tomahawk->getPrimaryDamage(base_bonus);
					result.tomahawk_primary_damage_radius =
						tomahawk->getPrimaryDamageRadius(base_bonus);
					result.tomahawk_secondary_damage = tomahawk->getSecondaryDamage(base_bonus);
					result.tomahawk_secondary_damage_radius =
						tomahawk->getSecondaryDamageRadius(base_bonus);
					result.tomahawk_attack_range = tomahawk->getUnmodifiedAttackRange();
					result.tomahawk_minimum_attack_range = tomahawk->getMinimumAttackRange();
					result.tomahawk_pre_attack_delay_frames =
						tomahawk->getPreAttackDelay(base_bonus);
					result.tomahawk_delay_frames = tomahawk->getDelayBetweenShots(base_bonus);
					result.tomahawk_clip_size = tomahawk->getClipSize();
					result.tomahawk_clip_reload_frames =
						tomahawk->getClipReloadTime(base_bonus);
					result.tomahawk_damage_type = tomahawk->getDamageType();
					result.tomahawk_death_type = tomahawk->getDeathType();
					result.tomahawk_fire_sound = tomahawk->getFireSound().getEventName().str();
					result.tomahawk_projectile_exhaust_loaded =
						tomahawk->getProjectileExhaust(LEVEL_REGULAR) != nullptr;
					result.tomahawk_heroic_projectile_exhaust_loaded =
						tomahawk->getProjectileExhaust(LEVEL_HEROIC) != nullptr;
				}

				result.parsed_fields = count_verified_fields(result);
				result.ok =
					result.bytes > 100000 &&
					result.particle_bytes > 100000 &&
					result.name_key_generator_loaded &&
					result.fx_list_store_loaded &&
					result.particle_system_manager_loaded &&
					result.weapon_store_loaded &&
					result.particle_original_ini_load &&
					result.original_ini_load &&
					result.parsed_fields == 37;
			}
		}
	} catch (...) {
		result.ok = false;
	}

	TheWeaponStore = old_weapon_store;
	TheParticleSystemManager = old_particle_system_manager;
	TheFXListStore = old_fx_list_store;
	TheNameKeyGenerator = old_name_key_generator;
	TheFileSystem = old_file_system;
	TheArchiveFileSystem = old_archive_file_system;
	TheLocalFileSystem = old_local_file_system;

	if (weapon_store != nullptr) {
		delete weapon_store;
	}
	if (particle_system_manager != nullptr) {
		delete particle_system_manager;
	}
	if (fx_list_store != nullptr) {
		delete fx_list_store;
	}
	if (name_key_generator != nullptr) {
		delete name_key_generator;
	}

	shutdownMemoryManager();

	return result;
}

RealAIDataIniProbeResult probe_original_ai_data_ini_load(const char *archive_path)
{
	RealAIDataIniProbeResult result;
	result.attempted = true;
	result.source = "GameEngine/Common/INI.cpp::load + INIAiData.cpp + AI.cpp + SidesList.cpp";
	result.archive_path = archive_path != nullptr ? archive_path : "";

	AsciiString archive_directory;
	AsciiString archive_mask;
	split_archive_path(archive_path, archive_directory, archive_mask);
	if (archive_mask.isEmpty()) {
		return result;
	}

	initMemoryManager();

	FileSystem *old_file_system = TheFileSystem;
	LocalFileSystem *old_local_file_system = TheLocalFileSystem;
	ArchiveFileSystem *old_archive_file_system = TheArchiveFileSystem;
	GameTextInterface *old_game_text = TheGameText;
	NameKeyGenerator *old_name_key_generator = TheNameKeyGenerator;
	ScienceStore *old_science_store = TheScienceStore;
	AI *old_ai = TheAI;

	Win32LocalFileSystem local_file_system;
	Win32BIGFileSystem archive_file_system;
	FileSystem file_system;
	GameTextInterface *game_text = nullptr;
	NameKeyGenerator *name_key_generator = nullptr;
	ScienceStore *science_store = nullptr;
	AI *ai = nullptr;

	try {
		TheLocalFileSystem = &local_file_system;
		TheArchiveFileSystem = &archive_file_system;
		TheFileSystem = &file_system;

		result.loaded_archives =
			archive_file_system.loadBigFilesFromDirectory(archive_directory, archive_mask);
		if (result.loaded_archives) {
			FileInfo default_file_info = {};
			result.default_file_exists =
				archive_file_system.getFileInfo(
					AsciiString(DEFAULT_AI_DATA_INI_PATH), &default_file_info) &&
				default_file_info.sizeHigh == 0 &&
				default_file_info.sizeLow > 0;
			result.bytes = result.default_file_exists ?
				static_cast<std::size_t>(default_file_info.sizeLow) : 0U;

			FileInfo override_file_info = {};
			result.override_file_exists =
				archive_file_system.getFileInfo(
					AsciiString(AI_DATA_INI_PATH), &override_file_info) &&
				override_file_info.sizeHigh == 0 &&
				override_file_info.sizeLow > 0;
			if (result.override_file_exists) {
				result.bytes += static_cast<std::size_t>(override_file_info.sizeLow);
			}

			FileInfo science_file_info = {};
			result.science_file_exists =
				archive_file_system.getFileInfo(
					AsciiString(SCIENCE_INI_PATH), &science_file_info) &&
				science_file_info.sizeHigh == 0 &&
				science_file_info.sizeLow > 0;
			result.science_bytes = result.science_file_exists ?
				static_cast<std::size_t>(science_file_info.sizeLow) : 0U;

			if (result.default_file_exists && result.science_file_exists) {
				name_key_generator = NEW NameKeyGenerator;
				TheNameKeyGenerator = name_key_generator;
				name_key_generator->init();

				game_text = CreateGameTextInterface();
				TheGameText = game_text;
				if (game_text != nullptr) {
					game_text->init();
				}

				science_store = NEW ScienceStore;
				TheScienceStore = science_store;
				science_store->init();
				result.science_store_loaded = true;

				INI science_ini;
				science_ini.load(AsciiString(SCIENCE_INI_PATH), INI_LOAD_OVERWRITE, nullptr);
				result.science_original_ini_load = true;

				ai = NEW AI;
				TheAI = ai;
				ai->init();
				result.ai_loaded = true;

				INI default_ini;
				default_ini.load(
					AsciiString(DEFAULT_AI_DATA_INI_PATH), INI_LOAD_OVERWRITE, nullptr);
				result.default_original_ini_load = true;

				if (result.override_file_exists) {
					INI override_ini;
					override_ini.load(
						AsciiString(AI_DATA_INI_PATH), INI_LOAD_CREATE_OVERRIDES, nullptr);
					result.override_original_ini_load = true;
				}

				const TAiData *data = ai->getAiData();
				result.structure_seconds = data->m_structureSeconds;
				result.team_seconds = data->m_teamSeconds;
				result.resources_wealthy = data->m_resourcesWealthy;
				result.resources_poor = data->m_resourcesPoor;
				result.force_idle_frames = data->m_forceIdleFramesCount;
				result.structures_wealthy_rate = data->m_structuresWealthyMod;
				result.teams_wealthy_rate = data->m_teamWealthyMod;
				result.structures_poor_rate = data->m_structuresPoorMod;
				result.teams_poor_rate = data->m_teamPoorMod;
				result.team_resources_to_start = data->m_teamResourcesToBuild;
				result.guard_inner_modifier_ai = data->m_guardInnerModifierAI;
				result.guard_outer_modifier_ai = data->m_guardOuterModifierAI;
				result.guard_inner_modifier_human = data->m_guardInnerModifierHuman;
				result.guard_outer_modifier_human = data->m_guardOuterModifierHuman;
				result.guard_chase_unit_frames = data->m_guardChaseUnitFrames;
				result.guard_enemy_scan_frames = data->m_guardEnemyScanRate;
				result.guard_enemy_return_scan_frames = data->m_guardEnemyReturnScanRate;
				result.attack_priority_distance_modifier =
					data->m_attackPriorityDistanceModifier;
				result.max_recruit_radius = data->m_maxRecruitDistance;
				result.skirmish_base_defense_extra_distance =
					data->m_skirmishBaseDefenseExtraDistance;
				result.wall_height = data->m_wallHeight;
				result.attack_uses_line_of_sight = data->m_attackUsesLineOfSight;
				result.attack_ignore_insignificant_buildings =
					data->m_attackIgnoreInsignificantBuildings;
				result.enable_repulsors = data->m_enableRepulsors;
				result.min_infantry_for_group = data->m_minInfantryForGroup;
				result.min_vehicles_for_group = data->m_minVehiclesForGroup;
				result.min_distance_for_group = data->m_minDistanceForGroup;
				result.distance_requires_group = data->m_distanceRequiresGroup;
				result.supply_center_safe_radius = data->m_supplyCenterSafeRadius;
				result.rebuild_delay_seconds = data->m_rebuildDelaySeconds;
				result.ai_crushes_infantry = data->m_aiCrushesInfantry;
				result.side_info_count = count_ai_side_info(data);
				result.build_list_count = count_ai_build_lists(data);

				const AISideInfo *america = find_ai_side_info(data, "America");
				result.america_side_found = america != nullptr;
				if (america != nullptr) {
					result.america_resource_gatherers_easy = america->m_easy;
					result.america_resource_gatherers_normal = america->m_normal;
					result.america_resource_gatherers_hard = america->m_hard;
					result.america_base_defense_structure =
						america->m_baseDefenseStructure1.str();
					result.america_skill_set1_count =
						static_cast<std::size_t>(america->m_skillSet1.m_numSkills);
					if (america->m_skillSet1.m_numSkills > 0) {
						result.america_skill_set1_first_science =
							science_store->getInternalNameForScience(
								america->m_skillSet1.m_skills[0]).str();
					}
				}

				const AISideInfo *gla = find_ai_side_info(data, "GLA");
				result.gla_side_found = gla != nullptr;
				if (gla != nullptr) {
					result.gla_resource_gatherers_easy = gla->m_easy;
					result.gla_base_defense_structure = gla->m_baseDefenseStructure1.str();
				}

				const AISideBuildList *america_build = find_ai_build_list(data, "America");
				result.america_build_list_found = america_build != nullptr;
				result.america_build_list_structure_count =
					count_ai_build_structures(america_build);
				BuildListInfo *first_build =
					america_build != nullptr ? america_build->m_buildList : nullptr;
				if (first_build != nullptr) {
					result.america_first_build_template =
						first_build->getTemplateName().str();
					const Coord3D *location = first_build->getLocation();
					result.america_first_build_x = location->x;
					result.america_first_build_y = location->y;
					result.america_first_build_angle = first_build->getAngle();
					result.america_first_build_automatically_build =
						first_build->isAutomaticBuild();
				}

				result.parsed_fields = count_verified_fields(result);
				result.ok =
					result.bytes > 20000 &&
					result.science_bytes > 20000 &&
					result.science_store_loaded &&
					result.ai_loaded &&
					result.science_original_ini_load &&
					result.default_original_ini_load &&
					(!result.override_file_exists || result.override_original_ini_load) &&
					result.parsed_fields == 50;
			}
		}
	} catch (...) {
		result.ok = false;
	}

	TheAI = old_ai;
	TheScienceStore = old_science_store;
	TheNameKeyGenerator = old_name_key_generator;
	TheGameText = old_game_text;
	TheFileSystem = old_file_system;
	TheArchiveFileSystem = old_archive_file_system;
	TheLocalFileSystem = old_local_file_system;

	if (ai != nullptr) {
		delete ai;
	}
	if (science_store != nullptr) {
		delete science_store;
	}
	if (game_text != nullptr) {
		delete game_text;
	}
	if (name_key_generator != nullptr) {
		delete name_key_generator;
	}

	shutdownMemoryManager();

	return result;
}

RealLocomotorIniProbeResult probe_original_locomotor_ini_load(const char *archive_path)
{
	RealLocomotorIniProbeResult result;
	result.attempted = true;
	result.source = "GameEngine/Common/INI.cpp::load + GameLogic/Object/Locomotor.cpp";
	result.archive_path = archive_path != nullptr ? archive_path : "";

	AsciiString archive_directory;
	AsciiString archive_mask;
	split_archive_path(archive_path, archive_directory, archive_mask);
	if (archive_mask.isEmpty()) {
		return result;
	}

	initMemoryManager();

	FileSystem *old_file_system = TheFileSystem;
	LocalFileSystem *old_local_file_system = TheLocalFileSystem;
	ArchiveFileSystem *old_archive_file_system = TheArchiveFileSystem;
	NameKeyGenerator *old_name_key_generator = TheNameKeyGenerator;
	LocomotorStore *old_locomotor_store = TheLocomotorStore;

	Win32LocalFileSystem local_file_system;
	Win32BIGFileSystem archive_file_system;
	FileSystem file_system;
	NameKeyGenerator *name_key_generator = nullptr;
	LocomotorStore *locomotor_store = nullptr;

	try {
		TheLocalFileSystem = &local_file_system;
		TheArchiveFileSystem = &archive_file_system;
		TheFileSystem = &file_system;

		result.loaded_archives =
			archive_file_system.loadBigFilesFromDirectory(archive_directory, archive_mask);
		if (result.loaded_archives) {
			FileInfo file_info = {};
			result.file_exists =
				archive_file_system.getFileInfo(
					AsciiString(LOCOMOTOR_INI_PATH), &file_info) &&
				file_info.sizeHigh == 0 &&
				file_info.sizeLow > 0;
			result.bytes = result.file_exists ?
				static_cast<std::size_t>(file_info.sizeLow) : 0U;

			if (result.file_exists) {
				name_key_generator = NEW NameKeyGenerator;
				TheNameKeyGenerator = name_key_generator;
				name_key_generator->init();
				result.name_key_generator_loaded = true;

				locomotor_store = NEW LocomotorStore;
				TheLocomotorStore = locomotor_store;
				locomotor_store->init();
				result.locomotor_store_loaded = true;

				INI ini;
				ini.load(AsciiString(LOCOMOTOR_INI_PATH), INI_LOAD_OVERWRITE, nullptr);
				result.original_ini_load = true;
				result.template_count =
					static_cast<std::size_t>(locomotor_store->wasmGetTemplateCount());

				const LocomotorTemplate *basic_human =
					locomotor_store->findLocomotorTemplate(NAMEKEY("BasicHumanLocomotor"));
				result.basic_human_found = basic_human != nullptr;
				if (basic_human != nullptr) {
					result.basic_human_speed = basic_human->wasmGetMaxSpeed();
					result.basic_human_speed_damaged =
						basic_human->wasmGetMaxSpeedDamaged();
					result.basic_human_turn_rate = basic_human->wasmGetMaxTurnRate();
					result.basic_human_acceleration = basic_human->wasmGetAcceleration();
					result.basic_human_braking = basic_human->wasmGetBraking();
					result.basic_human_surfaces =
						static_cast<int>(basic_human->wasmGetSurfaces());
					result.basic_human_appearance =
						static_cast<int>(basic_human->wasmGetAppearance());
					result.basic_human_z_behavior =
						static_cast<int>(basic_human->wasmGetBehaviorZ());
					result.basic_human_move_priority =
						static_cast<int>(basic_human->wasmGetMovePriority());
					result.basic_human_stick_to_ground =
						basic_human->wasmGetStickToGround();
				}

				const LocomotorTemplate *missile_defender =
					locomotor_store->findLocomotorTemplate(NAMEKEY("MissileDefenderLocomotor"));
				result.missile_defender_found = missile_defender != nullptr;
				if (missile_defender != nullptr) {
					result.missile_defender_speed =
						missile_defender->wasmGetMaxSpeed();
					result.missile_defender_move_priority =
						static_cast<int>(missile_defender->wasmGetMovePriority());
				}

				const LocomotorTemplate *humvee =
					locomotor_store->findLocomotorTemplate(NAMEKEY("HumveeLocomotor"));
				result.humvee_found = humvee != nullptr;
				if (humvee != nullptr) {
					result.humvee_speed = humvee->wasmGetMaxSpeed();
					result.humvee_speed_damaged = humvee->wasmGetMaxSpeedDamaged();
					result.humvee_turn_rate = humvee->wasmGetMaxTurnRate();
					result.humvee_acceleration = humvee->wasmGetAcceleration();
					result.humvee_braking = humvee->wasmGetBraking();
					result.humvee_min_turn_speed = humvee->wasmGetMinTurnSpeed();
					result.humvee_turn_pivot_offset = humvee->wasmGetTurnPivotOffset();
					result.humvee_wheel_turn_angle = humvee->wasmGetWheelTurnAngle();
					result.humvee_max_wheel_extension = humvee->wasmGetMaxWheelExtension();
					result.humvee_max_wheel_compression =
						humvee->wasmGetMaxWheelCompression();
					result.humvee_surfaces = static_cast<int>(humvee->wasmGetSurfaces());
					result.humvee_appearance =
						static_cast<int>(humvee->wasmGetAppearance());
					result.humvee_z_behavior =
						static_cast<int>(humvee->wasmGetBehaviorZ());
					result.humvee_stick_to_ground = humvee->wasmGetStickToGround();
					result.humvee_has_suspension = humvee->wasmGetHasSuspension();
					result.humvee_can_move_backward = humvee->wasmGetCanMoveBackward();
				}

				const LocomotorTemplate *comanche =
					locomotor_store->findLocomotorTemplate(NAMEKEY("ComancheLocomotor"));
				result.comanche_found = comanche != nullptr;
				if (comanche != nullptr) {
					result.comanche_speed = comanche->wasmGetMaxSpeed();
					result.comanche_speed_damaged = comanche->wasmGetMaxSpeedDamaged();
					result.comanche_turn_rate = comanche->wasmGetMaxTurnRate();
					result.comanche_acceleration = comanche->wasmGetAcceleration();
					result.comanche_lift = comanche->wasmGetLift();
					result.comanche_lift_damaged = comanche->wasmGetLiftDamaged();
					result.comanche_braking = comanche->wasmGetBraking();
					result.comanche_preferred_height =
						comanche->wasmGetPreferredHeight();
					result.comanche_surfaces =
						static_cast<int>(comanche->wasmGetSurfaces());
					result.comanche_appearance =
						static_cast<int>(comanche->wasmGetAppearance());
					result.comanche_z_behavior =
						static_cast<int>(comanche->wasmGetBehaviorZ());
					result.comanche_airborne_targeting_height =
						comanche->wasmGetAirborneTargetingHeight();
					result.comanche_allow_airborne_motive_force =
						comanche->wasmGetAllowMotiveForceWhileAirborne();
					result.comanche_apply_2d_friction_when_airborne =
						comanche->wasmGetApply2DFrictionWhenAirborne();
					result.comanche_locomotor_works_when_dead =
						comanche->wasmGetLocomotorWorksWhenDead();
				}

				result.parsed_fields = count_verified_fields(result);
				result.ok =
					result.bytes > 100000 &&
					result.name_key_generator_loaded &&
					result.locomotor_store_loaded &&
					result.original_ini_load &&
					result.parsed_fields == 48;
			}
		}
	} catch (...) {
		result.ok = false;
	}

	TheLocomotorStore = old_locomotor_store;
	TheNameKeyGenerator = old_name_key_generator;
	TheFileSystem = old_file_system;
	TheArchiveFileSystem = old_archive_file_system;
	TheLocalFileSystem = old_local_file_system;

	if (locomotor_store != nullptr) {
		delete locomotor_store;
	}
	if (name_key_generator != nullptr) {
		delete name_key_generator;
	}

	shutdownMemoryManager();

	return result;
}

RealScienceIniProbeResult probe_original_science_ini_load(const char *archive_path)
{
	RealScienceIniProbeResult result;
	result.attempted = true;
	result.source = "GameEngine/Common/INI.cpp::load + Common/RTS/Science.cpp";
	result.archive_path = archive_path != nullptr ? archive_path : "";

	AsciiString archive_directory;
	AsciiString archive_mask;
	split_archive_path(archive_path, archive_directory, archive_mask);
	if (archive_mask.isEmpty()) {
		return result;
	}

	initMemoryManager();

	FileSystem *old_file_system = TheFileSystem;
	LocalFileSystem *old_local_file_system = TheLocalFileSystem;
	ArchiveFileSystem *old_archive_file_system = TheArchiveFileSystem;
	GameTextInterface *old_game_text = TheGameText;
	NameKeyGenerator *old_name_key_generator = TheNameKeyGenerator;
	ScienceStore *old_science_store = TheScienceStore;

	Win32LocalFileSystem local_file_system;
	Win32BIGFileSystem archive_file_system;
	FileSystem file_system;
	GameTextInterface *game_text = nullptr;
	NameKeyGenerator *name_key_generator = nullptr;
	ScienceStore *science_store = nullptr;

	try {
		TheLocalFileSystem = &local_file_system;
		TheArchiveFileSystem = &archive_file_system;
		TheFileSystem = &file_system;

		result.loaded_archives = archive_file_system.loadBigFilesFromDirectory(archive_directory, archive_mask);
		if (result.loaded_archives) {
			FileInfo file_info = {};
			result.file_exists =
				archive_file_system.getFileInfo(AsciiString(SCIENCE_INI_PATH), &file_info) &&
				file_info.sizeHigh == 0 &&
				file_info.sizeLow > 0;
			result.bytes = result.file_exists ? static_cast<std::size_t>(file_info.sizeLow) : 0U;

			if (result.file_exists) {
				name_key_generator = NEW NameKeyGenerator;
				TheNameKeyGenerator = name_key_generator;
				name_key_generator->init();
				result.name_key_generator_loaded = true;

				game_text = CreateGameTextInterface();
				TheGameText = game_text;
				if (game_text != nullptr) {
					game_text->init();
					Bool title_exists = FALSE;
					const UnicodeString title = game_text->fetch("GUI:Command&ConquerGenerals", &title_exists);
					result.game_text_loaded = title_exists && unicode_not_empty(title);
				}

				science_store = NEW ScienceStore;
				TheScienceStore = science_store;
				science_store->init();

				INI ini;
				ini.load(AsciiString(SCIENCE_INI_PATH), INI_LOAD_OVERWRITE, nullptr);
				result.original_ini_load = true;

				const ScienceType america =
					science_store->getScienceFromInternalName(AsciiString("SCIENCE_AMERICA"));
				const ScienceType rank3 =
					science_store->getScienceFromInternalName(AsciiString("SCIENCE_Rank3"));
				const ScienceType paladin =
					science_store->getScienceFromInternalName(AsciiString("SCIENCE_PaladinTank"));

				result.america_science_found = science_store->isValidScience(america);
				result.rank3_science_found = science_store->isValidScience(rank3);
				result.paladin_science_found = science_store->isValidScience(paladin);
				result.science_count = science_store->friend_getScienceNames().size();
				result.america_purchase_cost = science_store->getSciencePurchaseCost(america);
				result.paladin_purchase_cost = science_store->getSciencePurchaseCost(paladin);
				result.america_grantable = science_store->isScienceGrantable(america);
				result.paladin_grantable = science_store->isScienceGrantable(paladin);

				UnicodeString paladin_name;
				UnicodeString paladin_description;
				if (science_store->getNameAndDescription(paladin, paladin_name, paladin_description)) {
					result.paladin_name_loaded = unicode_not_empty(paladin_name);
					result.paladin_description_loaded = unicode_not_empty(paladin_description);
				}

				result.parsed_fields = count_verified_fields(result);
				result.ok =
					result.bytes > 20000 &&
					result.game_text_loaded &&
					result.name_key_generator_loaded &&
					result.original_ini_load &&
					result.parsed_fields == 10;
			}
		}
	} catch (...) {
		result.ok = false;
	}

	TheScienceStore = old_science_store;
	TheNameKeyGenerator = old_name_key_generator;
	TheGameText = old_game_text;
	TheFileSystem = old_file_system;
	TheArchiveFileSystem = old_archive_file_system;
	TheLocalFileSystem = old_local_file_system;

	if (science_store != nullptr) {
		delete science_store;
	}
	if (game_text != nullptr) {
		delete game_text;
	}
	if (name_key_generator != nullptr) {
		delete name_key_generator;
	}

	shutdownMemoryManager();

	return result;
}

RealSpecialPowerIniProbeResult probe_original_special_power_ini_load(const char *archive_path)
{
	RealSpecialPowerIniProbeResult result;
	result.attempted = true;
	result.source =
		"GameEngine/Common/INI.cpp::load + INISpecialPower.cpp + SpecialPower.cpp + AcademyStats.cpp";
	result.archive_path = archive_path != nullptr ? archive_path : "";

	AsciiString archive_directory;
	AsciiString archive_mask;
	split_archive_path(archive_path, archive_directory, archive_mask);
	if (archive_mask.isEmpty()) {
		return result;
	}

	initMemoryManager();

	FileSystem *old_file_system = TheFileSystem;
	LocalFileSystem *old_local_file_system = TheLocalFileSystem;
	ArchiveFileSystem *old_archive_file_system = TheArchiveFileSystem;
	GameTextInterface *old_game_text = TheGameText;
	NameKeyGenerator *old_name_key_generator = TheNameKeyGenerator;
	ScienceStore *old_science_store = TheScienceStore;
	SpecialPowerStore *old_special_power_store = TheSpecialPowerStore;

	Win32LocalFileSystem local_file_system;
	Win32BIGFileSystem archive_file_system;
	FileSystem file_system;
	GameTextInterface *game_text = nullptr;
	NameKeyGenerator *name_key_generator = nullptr;
	ScienceStore *science_store = nullptr;
	SpecialPowerStore *special_power_store = nullptr;

	try {
		TheLocalFileSystem = &local_file_system;
		TheArchiveFileSystem = &archive_file_system;
		TheFileSystem = &file_system;

		result.loaded_archives = archive_file_system.loadBigFilesFromDirectory(archive_directory, archive_mask);
		if (result.loaded_archives) {
			FileInfo science_file_info = {};
			result.science_file_exists =
				archive_file_system.getFileInfo(AsciiString(SCIENCE_INI_PATH), &science_file_info) &&
				science_file_info.sizeHigh == 0 &&
				science_file_info.sizeLow > 0;
			result.science_bytes = result.science_file_exists ?
				static_cast<std::size_t>(science_file_info.sizeLow) : 0U;

			FileInfo file_info = {};
			result.file_exists =
				archive_file_system.getFileInfo(AsciiString(SPECIAL_POWER_INI_PATH), &file_info) &&
				file_info.sizeHigh == 0 &&
				file_info.sizeLow > 0;
			result.bytes = result.file_exists ? static_cast<std::size_t>(file_info.sizeLow) : 0U;

			if (result.science_file_exists && result.file_exists) {
				name_key_generator = NEW NameKeyGenerator;
				TheNameKeyGenerator = name_key_generator;
				name_key_generator->init();
				result.name_key_generator_loaded = true;

				game_text = CreateGameTextInterface();
				TheGameText = game_text;
				if (game_text != nullptr) {
					game_text->init();
					Bool title_exists = FALSE;
					const UnicodeString title = game_text->fetch("GUI:Command&ConquerGenerals", &title_exists);
					result.game_text_loaded = title_exists && unicode_not_empty(title);
				}

				science_store = NEW ScienceStore;
				TheScienceStore = science_store;
				science_store->init();

				INI science_ini;
				science_ini.load(AsciiString(SCIENCE_INI_PATH), INI_LOAD_OVERWRITE, nullptr);
				result.science_original_ini_load = true;

				special_power_store = NEW SpecialPowerStore;
				TheSpecialPowerStore = special_power_store;
				special_power_store->init();

				INI ini;
				ini.load(AsciiString(SPECIAL_POWER_INI_PATH), INI_LOAD_OVERWRITE, nullptr);
				result.original_ini_load = true;

				result.special_power_count =
					static_cast<std::size_t>(special_power_store->getNumSpecialPowers());

				const SpecialPowerTemplate *daisy =
					special_power_store->findSpecialPowerTemplate(AsciiString("SuperweaponDaisyCutter"));
				const SpecialPowerTemplate *carpet =
					special_power_store->findSpecialPowerTemplate(AsciiString("SuperweaponCarpetBomb"));
				const SpecialPowerTemplate *crate =
					special_power_store->findSpecialPowerTemplate(AsciiString("SuperweaponCrateDrop"));
				const SpecialPowerTemplate *neutron =
					special_power_store->findSpecialPowerTemplate(AsciiString("SuperweaponNeutronMissile"));
				const SpecialPowerTemplate *scud =
					special_power_store->findSpecialPowerTemplate(AsciiString("SuperweaponScudStorm"));

				result.daisy_cutter_found = daisy != nullptr;
				result.carpet_bomb_found = carpet != nullptr;
				result.crate_drop_found = crate != nullptr;
				result.neutron_missile_found = neutron != nullptr;
				result.scud_storm_found = scud != nullptr;

				if (daisy != nullptr) {
					const ScienceType required_science = daisy->getRequiredScience();
					result.daisy_cutter_enum = static_cast<int>(daisy->getSpecialPowerType());
					result.daisy_cutter_reload_frames = static_cast<int>(daisy->getReloadTime());
					result.daisy_cutter_required_science_valid =
						science_store->isValidScience(required_science);
					result.daisy_cutter_required_science =
						science_store->getInternalNameForScience(required_science).str();
					result.daisy_cutter_public_timer = daisy->hasPublicTimer();
					result.daisy_cutter_shared_synced_timer = daisy->isSharedNSync();
					result.daisy_cutter_view_object_duration_frames =
						static_cast<int>(daisy->getViewObjectDuration());
					result.daisy_cutter_view_object_range = daisy->getViewObjectRange();
					result.daisy_cutter_radius_cursor_radius = daisy->getRadiusCursorRadius();
					result.daisy_cutter_shortcut_power = daisy->isShortcutPower();
					result.daisy_cutter_academy_classification =
						static_cast<int>(daisy->getAcademyClassificationType());
				}
				if (carpet != nullptr) {
					result.carpet_bomb_enum = static_cast<int>(carpet->getSpecialPowerType());
					result.carpet_bomb_reload_frames = static_cast<int>(carpet->getReloadTime());
					result.carpet_bomb_public_timer = carpet->hasPublicTimer();
					result.carpet_bomb_shared_synced_timer = carpet->isSharedNSync();
					result.carpet_bomb_view_object_duration_frames =
						static_cast<int>(carpet->getViewObjectDuration());
					result.carpet_bomb_view_object_range = carpet->getViewObjectRange();
					result.carpet_bomb_radius_cursor_radius = carpet->getRadiusCursorRadius();
					result.carpet_bomb_shortcut_power = carpet->isShortcutPower();
					result.carpet_bomb_academy_classification =
						static_cast<int>(carpet->getAcademyClassificationType());
				}
				if (crate != nullptr) {
					const ScienceType required_science = crate->getRequiredScience();
					result.crate_drop_enum = static_cast<int>(crate->getSpecialPowerType());
					result.crate_drop_reload_frames = static_cast<int>(crate->getReloadTime());
					result.crate_drop_required_science_valid =
						science_store->isValidScience(required_science);
					result.crate_drop_required_science =
						science_store->getInternalNameForScience(required_science).str();
					result.crate_drop_public_timer = crate->hasPublicTimer();
					result.crate_drop_shared_synced_timer = crate->isSharedNSync();
					result.crate_drop_view_object_duration_frames =
						static_cast<int>(crate->getViewObjectDuration());
					result.crate_drop_view_object_range = crate->getViewObjectRange();
					result.crate_drop_radius_cursor_radius = crate->getRadiusCursorRadius();
					result.crate_drop_shortcut_power = crate->isShortcutPower();
				}
				if (neutron != nullptr) {
					result.neutron_missile_initiate_at_location_sound =
						neutron->getInitiateAtTargetSound()->getEventName().str();
				}
				if (scud != nullptr) {
					result.scud_storm_initiate_sound =
						scud->getInitiateSound()->getEventName().str();
				}

				result.parsed_fields = count_verified_fields(result);
				result.ok =
					result.bytes > 30000 &&
					result.science_bytes > 20000 &&
					result.game_text_loaded &&
					result.name_key_generator_loaded &&
					result.science_original_ini_load &&
					result.original_ini_load &&
					result.parsed_fields == 38;
			}
		}
	} catch (...) {
		result.ok = false;
	}

	TheSpecialPowerStore = old_special_power_store;
	TheScienceStore = old_science_store;
	TheNameKeyGenerator = old_name_key_generator;
	TheGameText = old_game_text;
	TheFileSystem = old_file_system;
	TheArchiveFileSystem = old_archive_file_system;
	TheLocalFileSystem = old_local_file_system;

	if (special_power_store != nullptr) {
		delete special_power_store;
	}
	if (science_store != nullptr) {
		delete science_store;
	}
	if (game_text != nullptr) {
		delete game_text;
	}
	if (name_key_generator != nullptr) {
		delete name_key_generator;
	}

	shutdownMemoryManager();

	return result;
}

RealPlayerTemplateIniProbeResult probe_original_player_template_ini_load(const char *archive_path)
{
	RealPlayerTemplateIniProbeResult result;
	result.attempted = true;
	result.source =
		"GameEngine/Common/INI.cpp::load + PlayerTemplate.cpp + Science.cpp";
	result.archive_path = archive_path != nullptr ? archive_path : "";

	AsciiString archive_directory;
	AsciiString archive_mask;
	split_archive_path(archive_path, archive_directory, archive_mask);
	if (archive_mask.isEmpty()) {
		return result;
	}

	initMemoryManager();

	FileSystem *old_file_system = TheFileSystem;
	LocalFileSystem *old_local_file_system = TheLocalFileSystem;
	ArchiveFileSystem *old_archive_file_system = TheArchiveFileSystem;
	GameTextInterface *old_game_text = TheGameText;
	NameKeyGenerator *old_name_key_generator = TheNameKeyGenerator;
	ScienceStore *old_science_store = TheScienceStore;
	PlayerTemplateStore *old_player_template_store = ThePlayerTemplateStore;

	Win32LocalFileSystem local_file_system;
	Win32BIGFileSystem archive_file_system;
	FileSystem file_system;
	GameTextInterface *game_text = nullptr;
	NameKeyGenerator *name_key_generator = nullptr;
	ScienceStore *science_store = nullptr;
	PlayerTemplateStore *player_template_store = nullptr;

	try {
		TheLocalFileSystem = &local_file_system;
		TheArchiveFileSystem = &archive_file_system;
		TheFileSystem = &file_system;

		result.loaded_archives = archive_file_system.loadBigFilesFromDirectory(archive_directory, archive_mask);
		if (result.loaded_archives) {
			FileInfo science_file_info = {};
			result.science_file_exists =
				archive_file_system.getFileInfo(AsciiString(SCIENCE_INI_PATH), &science_file_info) &&
				science_file_info.sizeHigh == 0 &&
				science_file_info.sizeLow > 0;
			result.science_bytes = result.science_file_exists ?
				static_cast<std::size_t>(science_file_info.sizeLow) : 0U;

			FileInfo file_info = {};
			result.file_exists =
				archive_file_system.getFileInfo(AsciiString(PLAYER_TEMPLATE_INI_PATH), &file_info) &&
				file_info.sizeHigh == 0 &&
				file_info.sizeLow > 0;
			result.bytes = result.file_exists ? static_cast<std::size_t>(file_info.sizeLow) : 0U;

			if (result.science_file_exists && result.file_exists) {
				name_key_generator = NEW NameKeyGenerator;
				TheNameKeyGenerator = name_key_generator;
				name_key_generator->init();
				result.name_key_generator_loaded = true;

				game_text = CreateGameTextInterface();
				TheGameText = game_text;
				if (game_text != nullptr) {
					game_text->init();
					Bool title_exists = FALSE;
					const UnicodeString title = game_text->fetch("GUI:Command&ConquerGenerals", &title_exists);
					result.game_text_loaded = title_exists && unicode_not_empty(title);
				}

				science_store = NEW ScienceStore;
				TheScienceStore = science_store;
				science_store->init();

				INI science_ini;
				science_ini.load(AsciiString(SCIENCE_INI_PATH), INI_LOAD_OVERWRITE, nullptr);
				result.science_original_ini_load = true;

				player_template_store = NEW PlayerTemplateStore;
				ThePlayerTemplateStore = player_template_store;
				player_template_store->init();

				seed_player_template_alias_name_keys();

				INI ini;
				ini.load(AsciiString(PLAYER_TEMPLATE_INI_PATH), INI_LOAD_OVERWRITE, nullptr);
				result.original_ini_load = true;

				result.player_template_count =
					static_cast<std::size_t>(player_template_store->getPlayerTemplateCount());
				AsciiStringList side_strings;
				player_template_store->getAllSideStrings(&side_strings);
				result.side_count = side_strings.size();

				const PlayerTemplate *america =
					player_template_store->findPlayerTemplate(NAMEKEY("FactionAmerica"));
				const PlayerTemplate *china =
					player_template_store->findPlayerTemplate(NAMEKEY("FactionChina"));
				const PlayerTemplate *gla =
					player_template_store->findPlayerTemplate(NAMEKEY("FactionGLA"));
				const PlayerTemplate *observer =
					player_template_store->findPlayerTemplate(NAMEKEY("FactionObserver"));
				const PlayerTemplate *air_force =
					player_template_store->findPlayerTemplate(NAMEKEY("FactionAmericaAirForceGeneral"));
				const PlayerTemplate *boss =
					player_template_store->findPlayerTemplate(NAMEKEY("FactionBossGeneral"));

				result.america_found = america != nullptr;
				result.china_found = china != nullptr;
				result.gla_found = gla != nullptr;
				result.observer_found = observer != nullptr;
				result.air_force_found = air_force != nullptr;
				result.boss_found = boss != nullptr;

				if (america != nullptr) {
					const ScienceVec &sciences = america->getIntrinsicSciences();
					result.america_display_name_loaded = unicode_not_empty(america->getDisplayName());
					result.america_side = america->getSide().str();
					result.america_base_side = america->getBaseSide().str();
					result.america_playable = america->isPlayableSide();
					result.america_old_faction = america->isOldFaction();
					result.america_start_money = static_cast<int>(america->getMoney()->countMoney());
					result.america_intrinsic_science_count = sciences.size();
					result.america_intrinsic_science_valid = sciences_valid(*science_store, sciences);
					result.america_starting_building = america->getStartingBuilding().str();
					result.america_starting_unit0 = america->getStartingUnit(0).str();
					result.america_shortcut_command_set =
						america->getSpecialPowerShortcutCommandSet().str();
					result.america_shortcut_win_name =
						america->getSpecialPowerShortcutWinName().str();
					result.america_shortcut_button_count =
						static_cast<int>(america->getSpecialPowerShortcutButtonCount());
					result.america_load_screen = america->getLoadScreen().str();
					result.america_score_screen = america->getScoreScreen().str();
					result.america_load_music = america->getLoadScreenMusic().str();
					result.america_score_music = america->getScoreScreenMusic().str();
					result.america_beacon = america->getBeaconTemplate().str();
				}
				if (observer != nullptr) {
					result.observer_is_observer = observer->isObserver();
					result.observer_playable = observer->isPlayableSide();
					result.observer_side = observer->getSide().str();
					result.observer_load_screen = observer->getLoadScreen().str();
					result.observer_beacon = observer->getBeaconTemplate().str();
				}
				if (air_force != nullptr) {
					result.air_force_side = air_force->getSide().str();
					result.air_force_base_side = air_force->getBaseSide().str();
					result.air_force_playable = air_force->isPlayableSide();
					result.air_force_old_faction = air_force->isOldFaction();
					result.air_force_starting_building = air_force->getStartingBuilding().str();
					result.air_force_starting_unit0 = air_force->getStartingUnit(0).str();
					result.air_force_shortcut_command_set =
						air_force->getSpecialPowerShortcutCommandSet().str();
					result.air_force_shortcut_button_count =
						static_cast<int>(air_force->getSpecialPowerShortcutButtonCount());
				}
				if (boss != nullptr) {
					const ScienceVec &sciences = boss->getIntrinsicSciences();
					result.boss_side = boss->getSide().str();
					result.boss_base_side = boss->getBaseSide().str();
					result.boss_playable = boss->isPlayableSide();
					result.boss_old_faction = boss->isOldFaction();
					result.boss_intrinsic_science_count = sciences.size();
					result.boss_intrinsic_sciences_valid = sciences_valid(*science_store, sciences);
					result.boss_starting_building = boss->getStartingBuilding().str();
					result.boss_starting_unit0 = boss->getStartingUnit(0).str();
					result.boss_shortcut_command_set = boss->getSpecialPowerShortcutCommandSet().str();
					result.boss_shortcut_win_name = boss->getSpecialPowerShortcutWinName().str();
					result.boss_shortcut_button_count =
						static_cast<int>(boss->getSpecialPowerShortcutButtonCount());
				}

				result.parsed_fields = count_verified_fields(result);
				result.ok =
					result.bytes > 10000 &&
					result.science_bytes > 20000 &&
					result.game_text_loaded &&
					result.name_key_generator_loaded &&
					result.science_original_ini_load &&
					result.original_ini_load &&
					result.parsed_fields == 50;
			}
		}
	} catch (...) {
		result.ok = false;
	}

	ThePlayerTemplateStore = old_player_template_store;
	TheScienceStore = old_science_store;
	TheNameKeyGenerator = old_name_key_generator;
	TheGameText = old_game_text;
	TheFileSystem = old_file_system;
	TheArchiveFileSystem = old_archive_file_system;
	TheLocalFileSystem = old_local_file_system;

	if (player_template_store != nullptr) {
		delete player_template_store;
	}
	if (science_store != nullptr) {
		delete science_store;
	}
	if (game_text != nullptr) {
		delete game_text;
	}
	if (name_key_generator != nullptr) {
		delete name_key_generator;
	}

	shutdownMemoryManager();

	return result;
}

RealWaterIniProbeResult probe_original_water_ini_load(const char *archive_path)
{
	RealWaterIniProbeResult result;
	result.attempted = true;
	result.source = "GameEngine/Common/INI.cpp::load + INIWater.cpp + GameClient/Water.cpp";
	result.archive_path = archive_path != nullptr ? archive_path : "";

	AsciiString archive_directory;
	AsciiString archive_mask;
	split_archive_path(archive_path, archive_directory, archive_mask);
	if (archive_mask.isEmpty()) {
		return result;
	}

	initMemoryManager();

	FileSystem *old_file_system = TheFileSystem;
	LocalFileSystem *old_local_file_system = TheLocalFileSystem;
	ArchiveFileSystem *old_archive_file_system = TheArchiveFileSystem;
	TerrainVisual *old_terrain_visual = TheTerrainVisual;
	WaterTransparencySetting *old_water_transparency =
		const_cast<WaterTransparencySetting *>(TheWaterTransparency.getNonOverloadedPointer());
	WaterSetting old_water_settings[TIME_OF_DAY_COUNT];
	copy_water_settings(old_water_settings);

	Win32LocalFileSystem local_file_system;
	Win32BIGFileSystem archive_file_system;
	FileSystem file_system;
	WaterTransparencySetting *water_transparency_to_delete = nullptr;

	try {
		TheLocalFileSystem = &local_file_system;
		TheArchiveFileSystem = &archive_file_system;
		TheFileSystem = &file_system;
		TheTerrainVisual = nullptr;
		TheWaterTransparency = nullptr;
		reset_water_settings();

		result.loaded_archives = archive_file_system.loadBigFilesFromDirectory(archive_directory, archive_mask);
		if (result.loaded_archives) {
			FileInfo file_info = {};
			result.file_exists =
				archive_file_system.getFileInfo(AsciiString(WATER_INI_PATH), &file_info) &&
				file_info.sizeHigh == 0 &&
				file_info.sizeLow > 0;
			result.bytes = result.file_exists ? static_cast<std::size_t>(file_info.sizeLow) : 0U;

			if (result.file_exists) {
				INI ini;
				ini.load(AsciiString(WATER_INI_PATH), INI_LOAD_OVERWRITE, nullptr);
				result.original_ini_load = true;

				water_transparency_to_delete =
					const_cast<WaterTransparencySetting *>(TheWaterTransparency.getNonOverloadedPointer());
				const WaterTransparencySetting *transparency = TheWaterTransparency;
				result.transparency_loaded = transparency != nullptr;
				result.water_set_count = count_loaded_water_settings();

				const WaterSetting &morning = WaterSettings[TIME_OF_DAY_MORNING];
				const WaterSetting &night = WaterSettings[TIME_OF_DAY_NIGHT];
				result.morning_sky_texture = morning.m_skyTextureFile.str();
				result.morning_water_texture = morning.m_waterTextureFile.str();
				result.morning_water_repeat_count = morning.m_waterRepeatCount;
				result.morning_sky_texels_per_unit = morning.m_skyTexelsPerUnit;
				result.morning_u_scroll_per_ms = morning.m_uScrollPerMs;
				result.morning_v_scroll_per_ms = morning.m_vScrollPerMs;
				result.night_sky_texture = night.m_skyTextureFile.str();
				result.night_water_texture = night.m_waterTextureFile.str();
				result.night_water_repeat_count = night.m_waterRepeatCount;
				result.night_sky_texels_per_unit = night.m_skyTexelsPerUnit;
				result.night_u_scroll_per_ms = night.m_uScrollPerMs;
				result.night_v_scroll_per_ms = night.m_vScrollPerMs;

				if (transparency != nullptr) {
					result.standing_water_texture = transparency->m_standingWaterTexture.str();
					result.transparent_water_depth = transparency->m_transparentWaterDepth;
					result.transparent_water_min_opacity = transparency->m_minWaterOpacity;
					result.additive_blending = transparency->m_additiveBlend;
				}
				result.parsed_fields = count_verified_fields(result);
				result.ok =
					result.bytes > 2000 &&
					result.original_ini_load &&
					result.parsed_fields == 18;
			}
		}
	} catch (...) {
		result.ok = false;
	}

	if (water_transparency_to_delete == nullptr) {
		WaterTransparencySetting *current_water_transparency =
			const_cast<WaterTransparencySetting *>(TheWaterTransparency.getNonOverloadedPointer());
		if (current_water_transparency != old_water_transparency) {
			water_transparency_to_delete = current_water_transparency;
		}
	}

	TheWaterTransparency = old_water_transparency;
	TheTerrainVisual = old_terrain_visual;
	TheFileSystem = old_file_system;
	TheArchiveFileSystem = old_archive_file_system;
	TheLocalFileSystem = old_local_file_system;

	if (water_transparency_to_delete != nullptr &&
		water_transparency_to_delete != old_water_transparency) {
		water_transparency_to_delete->deleteInstance();
	}
	restore_water_settings(old_water_settings);

	shutdownMemoryManager();

	return result;
}

RealVideoIniProbeResult probe_original_video_ini_load(const char *archive_path)
{
	RealVideoIniProbeResult result;
	result.attempted = true;
	result.source = "GameEngine/Common/INI.cpp::load + INIVideo.cpp + GameClient/VideoPlayer.cpp";
	result.archive_path = archive_path != nullptr ? archive_path : "";

	AsciiString archive_directory;
	AsciiString archive_mask;
	split_archive_path(archive_path, archive_directory, archive_mask);
	if (archive_mask.isEmpty()) {
		return result;
	}

	initMemoryManager();

	FileSystem *old_file_system = TheFileSystem;
	LocalFileSystem *old_local_file_system = TheLocalFileSystem;
	ArchiveFileSystem *old_archive_file_system = TheArchiveFileSystem;
	VideoPlayerInterface *old_video_player = TheVideoPlayer;

	{
		Win32LocalFileSystem local_file_system;
		Win32BIGFileSystem archive_file_system;
		FileSystem file_system;
		VideoPlayer video_player;

		try {
			TheLocalFileSystem = &local_file_system;
			TheArchiveFileSystem = &archive_file_system;
			TheFileSystem = &file_system;
			TheVideoPlayer = &video_player;

			result.loaded_archives = archive_file_system.loadBigFilesFromDirectory(archive_directory, archive_mask);
			if (result.loaded_archives) {
				FileInfo default_file_info = {};
				result.default_file_exists =
					archive_file_system.getFileInfo(AsciiString(DEFAULT_VIDEO_INI_PATH), &default_file_info) &&
					default_file_info.sizeHigh == 0 &&
					default_file_info.sizeLow > 0;
				result.default_bytes = result.default_file_exists ?
					static_cast<std::size_t>(default_file_info.sizeLow) : 0U;

				FileInfo file_info = {};
				result.file_exists =
					archive_file_system.getFileInfo(AsciiString(VIDEO_INI_PATH), &file_info) &&
					file_info.sizeHigh == 0 &&
					file_info.sizeLow > 0;
				result.bytes = result.file_exists ? static_cast<std::size_t>(file_info.sizeLow) : 0U;

				INI ini;
				if (result.default_file_exists) {
					ini.load(AsciiString(DEFAULT_VIDEO_INI_PATH), INI_LOAD_OVERWRITE, nullptr);
					result.default_original_ini_load = true;
				}
				if (result.file_exists) {
					ini.load(AsciiString(VIDEO_INI_PATH), INI_LOAD_OVERWRITE, nullptr);
					result.shipped_original_ini_load = true;
				}
				result.original_ini_load =
					result.default_original_ini_load ||
					result.shipped_original_ini_load;

				result.video_count = static_cast<std::size_t>(video_player.getNumVideos());
				const Video *first_video = video_player.getVideo(0);
				if (first_video != nullptr) {
					result.first_internal_name = first_video->m_internalName.str();
					result.first_filename = first_video->m_filename.str();
				}
				const Video *sample_video = nullptr;
				for (Int index = 0; index < video_player.getNumVideos(); ++index) {
					const Video *video = video_player.getVideo(index);
					if (video != nullptr &&
						!video->m_internalName.isEmpty() &&
						!video->m_filename.isEmpty()) {
						sample_video = video;
						break;
					}
				}
				if (sample_video != nullptr) {
					result.sample_internal_name = sample_video->m_internalName.str();
					result.sample_filename = sample_video->m_filename.str();
				}
				result.parsed_fields = count_verified_fields(result);
				result.ok =
					result.bytes > 0 &&
					result.shipped_original_ini_load &&
					result.video_count > 0 &&
					result.parsed_fields == 5;
			}
		} catch (...) {
			result.ok = false;
		}

		TheVideoPlayer = old_video_player;
		TheFileSystem = old_file_system;
		TheArchiveFileSystem = old_archive_file_system;
		TheLocalFileSystem = old_local_file_system;
	}

	shutdownMemoryManager();

	return result;
}

RealMultiplayerIniProbeResult probe_original_multiplayer_ini_load(const char *archive_path)
{
	RealMultiplayerIniProbeResult result;
	result.attempted = true;
	result.source =
		"GameEngine/Common/INI.cpp::load + INIMultiplayer.cpp + MultiplayerSettings.cpp + GameSpy/Chat.cpp";
	result.archive_path = archive_path != nullptr ? archive_path : "";

	AsciiString archive_directory;
	AsciiString archive_mask;
	split_archive_path(archive_path, archive_directory, archive_mask);
	if (archive_mask.isEmpty()) {
		return result;
	}

	initMemoryManager();

	FileSystem *old_file_system = TheFileSystem;
	LocalFileSystem *old_local_file_system = TheLocalFileSystem;
	ArchiveFileSystem *old_archive_file_system = TheArchiveFileSystem;
	MultiplayerSettings *old_multiplayer_settings = TheMultiplayerSettings;
	Color old_game_spy_color[GSCOLOR_MAX];
	std::copy(GameSpyColor, GameSpyColor + GSCOLOR_MAX, old_game_spy_color);

	Win32LocalFileSystem local_file_system;
	Win32BIGFileSystem archive_file_system;
	FileSystem file_system;
	MultiplayerSettings *multiplayer_settings_to_delete = nullptr;

	try {
		TheLocalFileSystem = &local_file_system;
		TheArchiveFileSystem = &archive_file_system;
		TheFileSystem = &file_system;
		TheMultiplayerSettings = nullptr;

		result.loaded_archives = archive_file_system.loadBigFilesFromDirectory(archive_directory, archive_mask);
		if (result.loaded_archives) {
			FileInfo file_info = {};
			result.file_exists =
				archive_file_system.getFileInfo(AsciiString(MULTIPLAYER_INI_PATH), &file_info) &&
				file_info.sizeHigh == 0 &&
				file_info.sizeLow > 0;
			result.bytes = result.file_exists ? static_cast<std::size_t>(file_info.sizeLow) : 0U;

			if (result.file_exists) {
				INI ini;
				ini.load(AsciiString(MULTIPLAYER_INI_PATH), INI_LOAD_OVERWRITE, nullptr);
				result.original_ini_load = true;

				MultiplayerSettings *settings = TheMultiplayerSettings;
				multiplayer_settings_to_delete = settings;
				if (settings != nullptr) {
					result.start_countdown_seconds = settings->getStartCountdownTimerSeconds();
					result.max_beacons_per_player = settings->getMaxBeaconsPerPlayer();
					result.use_shroud = settings->isShroudInMultiplayer();
					result.show_random_player_template = settings->showRandomPlayerTemplate();
					result.show_random_start_pos = settings->showRandomStartPos();
					result.show_random_color = settings->showRandomColor();
					result.color_count = static_cast<std::size_t>(settings->getNumColors());

					const MultiplayerColorDefinition *gold = settings->getColor(0);
					result.gold_color_found =
						gold != nullptr && gold->getTooltipName() == AsciiString("Color:Gold");
					if (gold != nullptr) {
						result.gold_color = static_cast<unsigned int>(gold->getColor());
					}

					const MultiplayerColorDefinition *purple = settings->getColor(6);
					result.purple_color_found =
						purple != nullptr && purple->getTooltipName() == AsciiString("Color:Purple");
					if (purple != nullptr) {
						result.purple_night_color = static_cast<unsigned int>(purple->getNightColor());
					}

					const MultiplayerStartingMoneyList &starting_money =
						settings->getStartingMoneyList();
					result.starting_money_count = starting_money.size();
					if (starting_money.size() > 0) {
						result.starting_money_first =
							static_cast<int>(starting_money[0].countMoney());
					}
					if (starting_money.size() > 1) {
						result.starting_money_second =
							static_cast<int>(starting_money[1].countMoney());
					}
					if (starting_money.size() > 2) {
						result.starting_money_third =
							static_cast<int>(starting_money[2].countMoney());
					}
					if (starting_money.size() > 3) {
						result.starting_money_fourth =
							static_cast<int>(starting_money[3].countMoney());
					}
					if (!starting_money.empty()) {
						result.default_starting_money =
							static_cast<int>(settings->getDefaultStartingMoney().countMoney());
					}
				}

				result.chat_default_color =
					static_cast<unsigned int>(GameSpyColor[GSCOLOR_DEFAULT]);
				result.chat_game_color =
					static_cast<unsigned int>(GameSpyColor[GSCOLOR_GAME]);
				result.chat_player_normal_color =
					static_cast<unsigned int>(GameSpyColor[GSCOLOR_PLAYER_NORMAL]);
				result.chat_self_color =
					static_cast<unsigned int>(GameSpyColor[GSCOLOR_CHAT_SELF]);
				result.chat_map_selected_color =
					static_cast<unsigned int>(GameSpyColor[GSCOLOR_MAP_SELECTED]);
				result.parsed_fields = count_verified_fields(result);
				result.ok =
					result.bytes > 2000 &&
					result.original_ini_load &&
					TheMultiplayerSettings != nullptr &&
					result.parsed_fields == 22;
			}
		}
	} catch (...) {
		result.ok = false;
	}

	if (multiplayer_settings_to_delete == nullptr &&
		TheMultiplayerSettings != old_multiplayer_settings) {
		multiplayer_settings_to_delete = TheMultiplayerSettings;
	}

	TheMultiplayerSettings = old_multiplayer_settings;
	std::copy(old_game_spy_color, old_game_spy_color + GSCOLOR_MAX, GameSpyColor);
	TheFileSystem = old_file_system;
	TheArchiveFileSystem = old_archive_file_system;
	TheLocalFileSystem = old_local_file_system;

	if (multiplayer_settings_to_delete != nullptr &&
		multiplayer_settings_to_delete != old_multiplayer_settings) {
		delete multiplayer_settings_to_delete;
	}

	shutdownMemoryManager();

	return result;
}

RealTerrainIniProbeResult probe_original_terrain_ini_load(const char *archive_path)
{
	RealTerrainIniProbeResult result;
	result.attempted = true;
	result.source = "GameEngine/Common/INI.cpp::load + INITerrain.cpp + TerrainTypes.cpp";
	result.archive_path = archive_path != nullptr ? archive_path : "";

	AsciiString archive_directory;
	AsciiString archive_mask;
	split_archive_path(archive_path, archive_directory, archive_mask);
	if (archive_mask.isEmpty()) {
		return result;
	}

	initMemoryManager();

	FileSystem *old_file_system = TheFileSystem;
	LocalFileSystem *old_local_file_system = TheLocalFileSystem;
	ArchiveFileSystem *old_archive_file_system = TheArchiveFileSystem;
	TerrainTypeCollection *old_terrain_types = TheTerrainTypes;

	Win32LocalFileSystem local_file_system;
	Win32BIGFileSystem archive_file_system;
	FileSystem file_system;
	TerrainTypeCollection *terrain_types = nullptr;

	try {
		TheLocalFileSystem = &local_file_system;
		TheArchiveFileSystem = &archive_file_system;
		TheFileSystem = &file_system;

		result.loaded_archives = archive_file_system.loadBigFilesFromDirectory(archive_directory, archive_mask);
		if (result.loaded_archives) {
			FileInfo file_info = {};
			result.file_exists =
				archive_file_system.getFileInfo(AsciiString(TERRAIN_INI_PATH), &file_info) &&
				file_info.sizeHigh == 0 &&
				file_info.sizeLow > 0;
			result.bytes = result.file_exists ? static_cast<std::size_t>(file_info.sizeLow) : 0U;

			if (result.file_exists) {
				terrain_types = NEW TerrainTypeCollection;
				TheTerrainTypes = terrain_types;

				INI ini;
				ini.load(AsciiString(TERRAIN_INI_PATH), INI_LOAD_OVERWRITE, nullptr);
				result.original_ini_load = true;

				result.terrain_count = count_terrain_collection(*terrain_types);
				inspect_terrain_entry(
					*terrain_types,
					"GrassRockTransitionType1",
					result.transition_found,
					result.transition_texture,
					result.transition_class);
				inspect_terrain_entry(
					*terrain_types,
					"AsphaltType1",
					result.asphalt_found,
					result.asphalt_texture,
					result.asphalt_class);
				inspect_terrain_entry(
					*terrain_types,
					"SandMediumType5c",
					result.desert_dry_found,
					result.desert_dry_texture,
					result.desert_dry_class);
				inspect_terrain_entry(
					*terrain_types,
					"SandMediumType13grassy4",
					result.beach_tropical_found,
					result.beach_tropical_texture,
					result.beach_tropical_class);
				inspect_terrain_entry(
					*terrain_types,
					"SnowType1",
					result.snow_flat_found,
					result.snow_flat_texture,
					result.snow_flat_class);

				TerrainType *asphalt = terrain_types->findTerrain(AsciiString("AsphaltType1"));
				if (asphalt != nullptr) {
					result.asphalt_blend_edges = asphalt->isBlendEdge();
					result.asphalt_restrict_construction = asphalt->getRestrictConstruction();
				}

				result.parsed_fields = count_verified_fields(result);
				result.ok =
					result.bytes > 20000 &&
					result.original_ini_load &&
					result.parsed_fields == 18;
			}
		}
	} catch (...) {
		result.ok = false;
	}

	TheTerrainTypes = old_terrain_types;
	TheFileSystem = old_file_system;
	TheArchiveFileSystem = old_archive_file_system;
	TheLocalFileSystem = old_local_file_system;

	if (terrain_types != nullptr) {
		delete terrain_types;
	}

	shutdownMemoryManager();

	return result;
}

RealTerrainRoadsIniProbeResult probe_original_terrain_roads_ini_load(const char *archive_path)
{
	RealTerrainRoadsIniProbeResult result;
	result.attempted = true;
	result.source =
		"GameEngine/Common/INI.cpp::load + INITerrainRoad.cpp + INITerrainBridge.cpp + TerrainRoads.cpp";
	result.archive_path = archive_path != nullptr ? archive_path : "";

	AsciiString archive_directory;
	AsciiString archive_mask;
	split_archive_path(archive_path, archive_directory, archive_mask);
	if (archive_mask.isEmpty()) {
		return result;
	}

	initMemoryManager();

	FileSystem *old_file_system = TheFileSystem;
	LocalFileSystem *old_local_file_system = TheLocalFileSystem;
	ArchiveFileSystem *old_archive_file_system = TheArchiveFileSystem;
	TerrainRoadCollection *old_terrain_roads = TheTerrainRoads;

	Win32LocalFileSystem local_file_system;
	Win32BIGFileSystem archive_file_system;
	FileSystem file_system;
	TerrainRoadCollection *terrain_roads = nullptr;

	try {
		TheLocalFileSystem = &local_file_system;
		TheArchiveFileSystem = &archive_file_system;
		TheFileSystem = &file_system;

		result.loaded_archives = archive_file_system.loadBigFilesFromDirectory(archive_directory, archive_mask);
		if (result.loaded_archives) {
			FileInfo file_info = {};
			result.file_exists =
				archive_file_system.getFileInfo(AsciiString(ROADS_INI_PATH), &file_info) &&
				file_info.sizeHigh == 0 &&
				file_info.sizeLow > 0;
			result.bytes = result.file_exists ? static_cast<std::size_t>(file_info.sizeLow) : 0U;

			if (result.file_exists) {
				terrain_roads = NEW TerrainRoadCollection;
				TheTerrainRoads = terrain_roads;

				INI ini;
				ini.load(AsciiString(ROADS_INI_PATH), INI_LOAD_OVERWRITE, nullptr);
				result.original_ini_load = true;

				result.road_count = count_terrain_roads(*terrain_roads);
				result.bridge_count = count_terrain_bridges(*terrain_roads);
				inspect_terrain_road_entry(
					*terrain_roads,
					"TwoLane",
					result.two_lane_found,
					result.two_lane_texture,
					result.two_lane_width,
					result.two_lane_width_in_texture);
				float four_lane_width_in_texture = 0.0f;
				inspect_terrain_road_entry(
					*terrain_roads,
					"FourLane",
					result.four_lane_found,
					result.four_lane_texture,
					result.four_lane_width,
					four_lane_width_in_texture);
				inspect_terrain_road_entry(
					*terrain_roads,
					"DirtRoad",
					result.dirt_road_found,
					result.dirt_road_texture,
					result.dirt_road_width,
					result.dirt_road_width_in_texture);

				TerrainRoadType *concrete = terrain_roads->findBridge(AsciiString("Concrete"));
				result.concrete_bridge_found = concrete != nullptr;
				if (concrete != nullptr) {
					const RGBColor radar_color = concrete->getRadarColor();
					result.concrete_bridge_texture = concrete->getTexture().str();
					result.concrete_bridge_model = concrete->getBridgeModel().str();
					result.concrete_bridge_damaged_texture = concrete->getTextureDamaged().str();
					result.concrete_bridge_scaffold = concrete->getScaffoldObjectName().str();
					result.concrete_bridge_tower_left =
						concrete->getTowerObjectName(BRIDGE_TOWER_FROM_LEFT).str();
					result.concrete_bridge_damage_sound =
						concrete->getDamageToSoundString(BODY_DAMAGED).str();
					result.concrete_bridge_repaired_sound =
						concrete->getRepairedToSoundString(BODY_DAMAGED).str();
					result.concrete_bridge_damage_ocl =
						concrete->getDamageToOCLString(BODY_DAMAGED, 0).str();
					result.concrete_bridge_damage_fx =
						concrete->getDamageToFXString(BODY_DAMAGED, 0).str();
					result.concrete_bridge_repair_fx =
						concrete->getRepairedToFXString(BODY_PRISTINE, 0).str();
					result.concrete_bridge_scale = concrete->getBridgeScale();
					result.concrete_bridge_radar_red = radar_color.red;
					result.concrete_bridge_radar_green = radar_color.green;
					result.concrete_bridge_radar_blue = radar_color.blue;
					result.concrete_bridge_transition_effects_height =
						concrete->getTransitionEffectsHeight();
					result.concrete_bridge_num_fx_per_type = concrete->getNumFXPerType();
				}

				result.parsed_fields = count_verified_fields(result);
				result.ok =
					result.bytes > 30000 &&
					result.original_ini_load &&
					result.parsed_fields == 30;
			}
		}
	} catch (...) {
		result.ok = false;
	}

	TheTerrainRoads = old_terrain_roads;
	TheFileSystem = old_file_system;
	TheArchiveFileSystem = old_archive_file_system;
	TheLocalFileSystem = old_local_file_system;

	if (terrain_roads != nullptr) {
		delete terrain_roads;
	}

	shutdownMemoryManager();

	return result;
}

RealDrawGroupInfoIniProbeResult probe_original_draw_group_info_ini_load(const char *archive_path)
{
	RealDrawGroupInfoIniProbeResult result;
	result.attempted = true;
	result.source = "GameEngine/Common/INI.cpp::load + DrawGroupInfo.cpp";
	result.archive_path = archive_path != nullptr ? archive_path : "";

	AsciiString archive_directory;
	AsciiString archive_mask;
	split_archive_path(archive_path, archive_directory, archive_mask);
	if (archive_mask.isEmpty()) {
		return result;
	}

	initMemoryManager();

	FileSystem *old_file_system = TheFileSystem;
	LocalFileSystem *old_local_file_system = TheLocalFileSystem;
	ArchiveFileSystem *old_archive_file_system = TheArchiveFileSystem;
	DrawGroupInfo *old_draw_group_info = TheDrawGroupInfo;

	Win32LocalFileSystem local_file_system;
	Win32BIGFileSystem archive_file_system;
	FileSystem file_system;
	DrawGroupInfo *draw_group_info = nullptr;

	try {
		TheLocalFileSystem = &local_file_system;
		TheArchiveFileSystem = &archive_file_system;
		TheFileSystem = &file_system;

		result.loaded_archives = archive_file_system.loadBigFilesFromDirectory(archive_directory, archive_mask);
		if (result.loaded_archives) {
			FileInfo file_info = {};
			result.file_exists =
				archive_file_system.getFileInfo(AsciiString(DRAW_GROUP_INFO_INI_PATH), &file_info) &&
				file_info.sizeHigh == 0 &&
				file_info.sizeLow > 0;
			result.bytes = result.file_exists ? static_cast<std::size_t>(file_info.sizeLow) : 0U;

			if (result.file_exists) {
				draw_group_info = NEW DrawGroupInfo;
				TheDrawGroupInfo = draw_group_info;

				INI ini;
				ini.load(AsciiString(DRAW_GROUP_INFO_INI_PATH), INI_LOAD_OVERWRITE, nullptr);
				result.original_ini_load = true;

				result.font_name = draw_group_info->m_fontName.str();
				result.font_size = draw_group_info->m_fontSize;
				result.font_is_bold = draw_group_info->m_fontIsBold;
				result.use_player_color = draw_group_info->m_usePlayerColor;
				result.color_for_text =
					static_cast<unsigned int>(draw_group_info->m_colorForText);
				result.color_for_text_drop_shadow =
					static_cast<unsigned int>(draw_group_info->m_colorForTextDropShadow);
				result.drop_shadow_offset_x = draw_group_info->m_dropShadowOffsetX;
				result.drop_shadow_offset_y = draw_group_info->m_dropShadowOffsetY;
				result.using_pixel_offset_x = draw_group_info->m_usingPixelOffsetX;
				result.using_pixel_offset_y = draw_group_info->m_usingPixelOffsetY;
				if (draw_group_info->m_usingPixelOffsetX) {
					result.pixel_offset_x = draw_group_info->m_pixelOffsetX;
				} else {
					result.percent_offset_x = draw_group_info->m_percentOffsetX;
				}
				if (draw_group_info->m_usingPixelOffsetY) {
					result.pixel_offset_y = draw_group_info->m_pixelOffsetY;
				} else {
					result.percent_offset_y = draw_group_info->m_percentOffsetY;
				}

				result.parsed_fields = count_verified_fields(result);
				result.ok =
					result.bytes > 100 &&
					result.original_ini_load &&
					result.parsed_fields == 12;
			}
		}
	} catch (...) {
		result.ok = false;
	}

	TheDrawGroupInfo = old_draw_group_info;
	TheFileSystem = old_file_system;
	TheArchiveFileSystem = old_archive_file_system;
	TheLocalFileSystem = old_local_file_system;

	if (draw_group_info != nullptr) {
		delete draw_group_info;
	}

	shutdownMemoryManager();

	return result;
}

RealMappedImageIniProbeResult probe_original_mapped_image_ini_load(const char *archive_path)
{
	RealMappedImageIniProbeResult result;
	result.attempted = true;
	result.source =
		"GameEngine/Common/INI.cpp::loadDirectory + INIMappedImage.cpp + GameClient/Image.cpp";
	result.archive_path = archive_path != nullptr ? archive_path : "";

	AsciiString archive_directory;
	AsciiString archive_mask;
	split_archive_path(archive_path, archive_directory, archive_mask);
	if (archive_mask.isEmpty()) {
		return result;
	}

	initMemoryManager();

	FileSystem *old_file_system = TheFileSystem;
	LocalFileSystem *old_local_file_system = TheLocalFileSystem;
	ArchiveFileSystem *old_archive_file_system = TheArchiveFileSystem;
	NameKeyGenerator *old_name_key_generator = TheNameKeyGenerator;
	ImageCollection *old_mapped_image_collection = TheMappedImageCollection;
	GlobalData *old_global_data = TheWritableGlobalData;

	Win32LocalFileSystem local_file_system;
	Win32BIGFileSystem archive_file_system;
	FileSystem file_system;
	NameKeyGenerator *name_key_generator = nullptr;
	ImageCollection *mapped_image_collection = nullptr;

	try {
		TheLocalFileSystem = &local_file_system;
		TheArchiveFileSystem = &archive_file_system;
		TheFileSystem = &file_system;
		TheWritableGlobalData = nullptr;

		result.loaded_archives = archive_file_system.loadBigFilesFromDirectory(archive_directory, archive_mask);
		if (result.loaded_archives) {
			FileInfo sample_info = {};
			result.file_exists =
				archive_file_system.getFileInfo(AsciiString(MAPPED_IMAGES_SAMPLE_INI_PATH), &sample_info) &&
				sample_info.sizeHigh == 0 &&
				sample_info.sizeLow > 0;
			result.file_count = count_mapped_image_files(file_system, result.bytes);

			if (result.file_exists) {
				name_key_generator = NEW NameKeyGenerator;
				TheNameKeyGenerator = name_key_generator;
				name_key_generator->init();
				result.name_key_generator_loaded = true;

				mapped_image_collection = NEW ImageCollection;
				TheMappedImageCollection = mapped_image_collection;
				mapped_image_collection->load(512);
				result.original_ini_load = true;
				result.image_count = count_mapped_images(*mapped_image_collection);

				inspect_mapped_image(
					*mapped_image_collection,
					"SAChinook_L",
					result.sa_chinook_found,
					result.sa_chinook_texture,
					result.sa_chinook_texture_width,
					result.sa_chinook_texture_height,
					result.sa_chinook_width,
					result.sa_chinook_height,
					result.sa_chinook_status,
					&result.sa_chinook_uv_lo_x,
					&result.sa_chinook_uv_lo_y,
					&result.sa_chinook_uv_hi_x,
					&result.sa_chinook_uv_hi_y);

				int watermark_texture_width = 0;
				int watermark_texture_height = 0;
				inspect_mapped_image(
					*mapped_image_collection,
					"WatermarkChina",
					result.watermark_china_found,
					result.watermark_china_texture,
					watermark_texture_width,
					watermark_texture_height,
					result.watermark_china_width,
					result.watermark_china_height,
					result.watermark_china_status);
				result.watermark_china_rotated =
					(result.watermark_china_status & IMAGE_STATUS_ROTATED_90_CLOCKWISE) != 0;

				result.parsed_fields = count_verified_fields(result);
				result.ok =
					result.bytes > 100000 &&
					result.file_count == 14 &&
					result.name_key_generator_loaded &&
					result.original_ini_load &&
					result.parsed_fields == 18;
			}
		}
	} catch (...) {
		result.ok = false;
	}

	TheWritableGlobalData = old_global_data;
	TheMappedImageCollection = old_mapped_image_collection;
	TheNameKeyGenerator = old_name_key_generator;
	TheFileSystem = old_file_system;
	TheArchiveFileSystem = old_archive_file_system;
	TheLocalFileSystem = old_local_file_system;

	if (mapped_image_collection != nullptr) {
		delete mapped_image_collection;
	}
	if (name_key_generator != nullptr) {
		delete name_key_generator;
	}

	shutdownMemoryManager();

	return result;
}

RealControlBarSchemeIniProbeResult probe_original_control_bar_scheme_ini_load(const char *archive_path)
{
	RealControlBarSchemeIniProbeResult result;
	result.attempted = true;
	result.source =
		"GameEngine/Common/INI.cpp::load + INIControlBarScheme.cpp + ControlBarScheme.cpp + Image.cpp";
	result.archive_path = archive_path != nullptr ? archive_path : "";

	AsciiString archive_directory;
	AsciiString archive_mask;
	split_archive_path(archive_path, archive_directory, archive_mask);
	if (archive_mask.isEmpty()) {
		return result;
	}

	initMemoryManager();

	FileSystem *old_file_system = TheFileSystem;
	LocalFileSystem *old_local_file_system = TheLocalFileSystem;
	ArchiveFileSystem *old_archive_file_system = TheArchiveFileSystem;
	NameKeyGenerator *old_name_key_generator = TheNameKeyGenerator;
	ImageCollection *old_mapped_image_collection = TheMappedImageCollection;
	ControlBar *old_control_bar = TheControlBar;

	Win32LocalFileSystem local_file_system;
	Win32BIGFileSystem archive_file_system;
	FileSystem file_system;
	NameKeyGenerator *name_key_generator = nullptr;
	ImageCollection *mapped_image_collection = nullptr;
	ControlBar *control_bar = nullptr;

	try {
		TheLocalFileSystem = &local_file_system;
		TheArchiveFileSystem = &archive_file_system;
		TheFileSystem = &file_system;

		result.loaded_archives = archive_file_system.loadBigFilesFromDirectory(archive_directory, archive_mask);
		if (result.loaded_archives) {
			FileInfo default_file_info = {};
			result.default_file_exists =
				archive_file_system.getFileInfo(
					AsciiString(DEFAULT_CONTROL_BAR_SCHEME_INI_PATH),
					&default_file_info) &&
				default_file_info.sizeHigh == 0 &&
				default_file_info.sizeLow > 0;
			result.default_bytes = result.default_file_exists ?
				static_cast<std::size_t>(default_file_info.sizeLow) : 0U;

			FileInfo file_info = {};
			result.file_exists =
				archive_file_system.getFileInfo(AsciiString(CONTROL_BAR_SCHEME_INI_PATH), &file_info) &&
				file_info.sizeHigh == 0 &&
				file_info.sizeLow > 0;
			result.bytes = result.file_exists ? static_cast<std::size_t>(file_info.sizeLow) : 0U;

			if (result.default_file_exists && result.file_exists) {
				name_key_generator = NEW NameKeyGenerator;
				TheNameKeyGenerator = name_key_generator;
				name_key_generator->init();
				result.name_key_generator_loaded = true;

				mapped_image_collection = NEW ImageCollection;
				TheMappedImageCollection = mapped_image_collection;
				mapped_image_collection->load(512);
				result.mapped_images_loaded = true;
				result.mapped_image_count = count_mapped_images(*mapped_image_collection);

				control_bar = NEW ControlBar;
				TheControlBar = control_bar;
				ControlBarSchemeManager *manager = control_bar->getControlBarSchemeManager();
				result.control_bar_loaded = manager != nullptr;

				if (manager != nullptr) {
					INI default_ini;
					default_ini.load(
						AsciiString(DEFAULT_CONTROL_BAR_SCHEME_INI_PATH),
						INI_LOAD_OVERWRITE,
						nullptr);
					result.original_default_ini_load = true;

					INI ini;
					ini.load(AsciiString(CONTROL_BAR_SCHEME_INI_PATH), INI_LOAD_OVERWRITE, nullptr);
					result.original_ini_load = true;

					inspect_default_control_bar_scheme(*manager, result);
					inspect_control_bar_scheme_sample(
						*manager,
						"America8x6",
						result.america_found,
						result.america_side,
						result.america_right_hud_image,
						result.america_command_marker_image,
						result.america_power_purchase_image,
						result.america_base_image,
						&result.america_queue_image,
						nullptr,
						&result.america_screen_x,
						&result.america_screen_y,
						&result.america_base_layer,
						&result.america_base_x,
						&result.america_base_y,
						&result.america_base_width,
						&result.america_base_height);
					inspect_control_bar_scheme_sample(
						*manager,
						"GLA8x6",
						result.gla_found,
						result.gla_side,
						result.gla_right_hud_image,
						result.gla_command_marker_image,
						result.gla_power_purchase_image,
						result.gla_base_image);
					inspect_control_bar_scheme_sample(
						*manager,
						"China8x6",
						result.china_found,
						result.china_side,
						result.china_right_hud_image,
						result.china_command_marker_image,
						result.china_power_purchase_image,
						result.china_base_image,
						nullptr,
						&result.china_gen_arrow_image);

					result.parsed_fields = count_verified_fields(result);
					result.ok =
						result.default_bytes > 1000 &&
						result.bytes > 10000 &&
						result.mapped_images_loaded &&
						result.mapped_image_count == 1186 &&
						result.name_key_generator_loaded &&
						result.control_bar_loaded &&
						result.original_default_ini_load &&
						result.original_ini_load &&
						result.parsed_fields == 34;
				}
			}
		}
	} catch (...) {
		result.ok = false;
	}

	TheControlBar = old_control_bar;
	TheMappedImageCollection = old_mapped_image_collection;
	TheNameKeyGenerator = old_name_key_generator;
	TheFileSystem = old_file_system;
	TheArchiveFileSystem = old_archive_file_system;
	TheLocalFileSystem = old_local_file_system;

	if (control_bar != nullptr) {
		delete control_bar;
	}
	if (mapped_image_collection != nullptr) {
		delete mapped_image_collection;
	}
	if (name_key_generator != nullptr) {
		delete name_key_generator;
	}

	shutdownMemoryManager();

	return result;
}

RealCrateIniProbeResult probe_original_crate_ini_load(const char *archive_path)
{
	RealCrateIniProbeResult result;
	result.attempted = true;
	result.source =
		"GameEngine/Common/INI.cpp::load + INICrate.cpp + CrateSystem.cpp + Science.cpp";
	result.archive_path = archive_path != nullptr ? archive_path : "";

	AsciiString archive_directory;
	AsciiString archive_mask;
	split_archive_path(archive_path, archive_directory, archive_mask);
	if (archive_mask.isEmpty()) {
		return result;
	}

	initMemoryManager();

	FileSystem *old_file_system = TheFileSystem;
	LocalFileSystem *old_local_file_system = TheLocalFileSystem;
	ArchiveFileSystem *old_archive_file_system = TheArchiveFileSystem;
	GameTextInterface *old_game_text = TheGameText;
	NameKeyGenerator *old_name_key_generator = TheNameKeyGenerator;
	ScienceStore *old_science_store = TheScienceStore;
	CrateSystem *old_crate_system = TheCrateSystem;

	Win32LocalFileSystem local_file_system;
	Win32BIGFileSystem archive_file_system;
	FileSystem file_system;
	GameTextInterface *game_text = nullptr;
	NameKeyGenerator *name_key_generator = nullptr;
	ScienceStore *science_store = nullptr;
	CrateSystem *crate_system = nullptr;
	const char *probe_crate_names[] = {
		"SalvageCrateData",
		"EliteTankCrateData",
		"HeroicTankCrateData",
		"GLA02_Always100DollarCrate",
		"GLA02_Always200DollarCrate",
		"GLA02_Always1000DollarCrate",
		"GLA02_Always2500DollarCrate",
	};

	try {
		TheLocalFileSystem = &local_file_system;
		TheArchiveFileSystem = &archive_file_system;
		TheFileSystem = &file_system;

		result.loaded_archives = archive_file_system.loadBigFilesFromDirectory(archive_directory, archive_mask);
		if (result.loaded_archives) {
			FileInfo file_info = {};
			result.file_exists =
				archive_file_system.getFileInfo(AsciiString(CRATE_INI_PATH), &file_info) &&
				file_info.sizeHigh == 0 &&
				file_info.sizeLow > 0;
			result.bytes = result.file_exists ? static_cast<std::size_t>(file_info.sizeLow) : 0U;

			FileInfo science_file_info = {};
			result.science_file_exists =
				archive_file_system.getFileInfo(AsciiString(SCIENCE_INI_PATH), &science_file_info) &&
				science_file_info.sizeHigh == 0 &&
				science_file_info.sizeLow > 0;
			result.science_bytes = result.science_file_exists ?
				static_cast<std::size_t>(science_file_info.sizeLow) : 0U;

			if (result.file_exists && result.science_file_exists) {
				std::string shipped_crates;
				std::string filtered_crates;
				if (read_archive_text(file_system, CRATE_INI_PATH, shipped_crates)) {
					for (const char *crate_name : probe_crate_names) {
						if (append_crate_data_block(shipped_crates, crate_name, filtered_crates)) {
							++result.filtered_blocks;
						}
					}
				}

				result.filtered_bytes = filtered_crates.size();
				result.filtered_from_shipped = result.filtered_blocks == 7;

				name_key_generator = NEW NameKeyGenerator;
				TheNameKeyGenerator = name_key_generator;
				name_key_generator->init();
				result.name_key_generator_loaded = true;

				game_text = CreateGameTextInterface();
				TheGameText = game_text;
				if (game_text != nullptr) {
					game_text->init();
					Bool title_exists = FALSE;
					const UnicodeString title = game_text->fetch("GUI:Command&ConquerGenerals", &title_exists);
					result.game_text_loaded = title_exists && unicode_not_empty(title);
				}

				science_store = NEW ScienceStore;
				TheScienceStore = science_store;
				science_store->init();

				INI science_ini;
				science_ini.load(AsciiString(SCIENCE_INI_PATH), INI_LOAD_OVERWRITE, nullptr);
				result.science_original_ini_load = true;

				crate_system = NEW CrateSystem;
				TheCrateSystem = crate_system;
				crate_system->init();

				if (result.filtered_from_shipped &&
						write_probe_ini_file(CRATE_PROBE_INI_PATH, filtered_crates)) {
					INI ini;
					ini.load(AsciiString(CRATE_PROBE_INI_PATH), INI_LOAD_OVERWRITE, nullptr);
					result.original_ini_load = true;

					for (const char *crate_name : probe_crate_names) {
						if (crate_system->findCrateTemplate(AsciiString(crate_name)) != nullptr) {
							++result.crate_template_count;
						}
					}

					const CrateTemplate *salvage =
						crate_system->findCrateTemplate(AsciiString("SalvageCrateData"));
					result.salvage_found = salvage != nullptr;
					if (salvage != nullptr) {
						result.salvage_creation_chance = salvage->m_creationChance;
						result.salvage_salvager_kindof =
							TEST_KINDOFMASK(salvage->m_killedByTypeKindof, KINDOF_SALVAGER);
						result.salvage_killer_science_valid =
							salvage->m_killerScience ==
							static_cast<ScienceType>(name_key_generator->nameToKey("SCIENCE_GLA"));
						result.salvage_object_count = salvage->m_possibleCrates.size();
						inspect_crate_entry(
							salvage,
							0,
							result.salvage_object_name,
							result.salvage_object_chance);
					}

					const CrateTemplate *elite =
						crate_system->findCrateTemplate(AsciiString("EliteTankCrateData"));
					result.elite_found = elite != nullptr;
					if (elite != nullptr) {
						result.elite_creation_chance = elite->m_creationChance;
						result.elite_veterancy_level = elite->m_veterancyLevel;
						result.elite_object_count = elite->m_possibleCrates.size();
						inspect_crate_entry(elite, 0, result.elite_first_object, result.elite_first_chance);
						inspect_crate_entry(elite, 1, result.elite_second_object, result.elite_second_chance);
					}

					const CrateTemplate *heroic =
						crate_system->findCrateTemplate(AsciiString("HeroicTankCrateData"));
					result.heroic_found = heroic != nullptr;
					if (heroic != nullptr) {
						result.heroic_creation_chance = heroic->m_creationChance;
						result.heroic_veterancy_level = heroic->m_veterancyLevel;
						result.heroic_object_count = heroic->m_possibleCrates.size();
						inspect_crate_entry(heroic, 0, result.heroic_first_object, result.heroic_first_chance);
						inspect_crate_entry(heroic, 2, result.heroic_third_object, result.heroic_third_chance);
					}

					const CrateTemplate *gla02_100 =
						crate_system->findCrateTemplate(AsciiString("GLA02_Always100DollarCrate"));
					result.gla02_100_found = gla02_100 != nullptr;
					if (gla02_100 != nullptr) {
						result.gla02_100_owned_by_maker = gla02_100->m_isOwnedByMaker;
						inspect_crate_entry(
							gla02_100,
							0,
							result.gla02_100_object,
							result.gla02_100_object_chance);
					}

					const CrateTemplate *gla02_2500 =
						crate_system->findCrateTemplate(AsciiString("GLA02_Always2500DollarCrate"));
					result.gla02_2500_found = gla02_2500 != nullptr;
					if (gla02_2500 != nullptr) {
						result.gla02_2500_owned_by_maker = gla02_2500->m_isOwnedByMaker;
						inspect_crate_entry(
							gla02_2500,
							0,
							result.gla02_2500_object,
							result.gla02_2500_object_chance);
					}

					result.parsed_fields = count_verified_fields(result);
					result.ok =
						result.bytes > 10000 &&
						result.science_bytes > 10000 &&
						result.filtered_bytes > 500 &&
						result.name_key_generator_loaded &&
						result.science_original_ini_load &&
						result.original_ini_load &&
						result.parsed_fields == 34;
				}
			}
		}
	} catch (...) {
		result.ok = false;
	}

	TheCrateSystem = old_crate_system;
	TheScienceStore = old_science_store;
	TheNameKeyGenerator = old_name_key_generator;
	TheGameText = old_game_text;
	TheFileSystem = old_file_system;
	TheArchiveFileSystem = old_archive_file_system;
	TheLocalFileSystem = old_local_file_system;

	if (crate_system != nullptr) {
		delete crate_system;
	}
	if (science_store != nullptr) {
		delete science_store;
	}
	if (game_text != nullptr) {
		delete game_text;
	}
	if (name_key_generator != nullptr) {
		delete name_key_generator;
	}

	std::remove(CRATE_PROBE_INI_PATH);
	shutdownMemoryManager();

	return result;
}

RealUpgradeIniProbeResult probe_original_upgrade_ini_load(const char *archive_path)
{
	RealUpgradeIniProbeResult result;
	result.attempted = true;
	result.source = "GameEngine/Common/INI.cpp::load + INIUpgrade.cpp + Upgrade.cpp";
	result.archive_path = archive_path != nullptr ? archive_path : "";

	AsciiString archive_directory;
	AsciiString archive_mask;
	split_archive_path(archive_path, archive_directory, archive_mask);
	if (archive_mask.isEmpty()) {
		return result;
	}

	initMemoryManager();

	FileSystem *old_file_system = TheFileSystem;
	LocalFileSystem *old_local_file_system = TheLocalFileSystem;
	ArchiveFileSystem *old_archive_file_system = TheArchiveFileSystem;
	NameKeyGenerator *old_name_key_generator = TheNameKeyGenerator;
	UpgradeCenter *old_upgrade_center = TheUpgradeCenter;

	Win32LocalFileSystem local_file_system;
	Win32BIGFileSystem archive_file_system;
	FileSystem file_system;
	NameKeyGenerator *name_key_generator = nullptr;
	UpgradeCenter *upgrade_center = nullptr;

	try {
		TheLocalFileSystem = &local_file_system;
		TheArchiveFileSystem = &archive_file_system;
		TheFileSystem = &file_system;

		result.loaded_archives = archive_file_system.loadBigFilesFromDirectory(archive_directory, archive_mask);
		if (result.loaded_archives) {
			FileInfo file_info = {};
			result.file_exists =
				archive_file_system.getFileInfo(AsciiString(UPGRADE_INI_PATH), &file_info) &&
				file_info.sizeHigh == 0 &&
				file_info.sizeLow > 0;
			result.bytes = result.file_exists ? static_cast<std::size_t>(file_info.sizeLow) : 0U;

			if (result.file_exists) {
				name_key_generator = NEW NameKeyGenerator;
				TheNameKeyGenerator = name_key_generator;
				name_key_generator->init();
				result.name_key_generator_loaded = true;

				upgrade_center = NEW UpgradeCenter;
				TheUpgradeCenter = upgrade_center;
				upgrade_center->init();

				INI ini;
				ini.load(AsciiString(UPGRADE_INI_PATH), INI_LOAD_OVERWRITE, nullptr);
				result.original_ini_load = true;

				result.upgrade_count = count_upgrade_templates(*upgrade_center);
				result.veteran_found = upgrade_center->findVeterancyUpgrade(LEVEL_VETERAN) != nullptr;
				result.elite_found = upgrade_center->findVeterancyUpgrade(LEVEL_ELITE) != nullptr;
				result.heroic_found = upgrade_center->findVeterancyUpgrade(LEVEL_HEROIC) != nullptr;

				int unused_academy = 0;
				inspect_upgrade_entry(
					*upgrade_center,
					"Upgrade_AmericaRangerFlashBangGrenade",
					result.flash_bang_found,
					result.flash_bang_display_name,
					result.flash_bang_type,
					result.flash_bang_build_frames,
					result.flash_bang_cost,
					result.flash_bang_research_sound,
					unused_academy);
				std::string ignored_research_sound;
				inspect_upgrade_entry(
					*upgrade_center,
					"Upgrade_InfantryCaptureBuilding",
					result.capture_building_found,
					result.capture_building_display_name,
					result.capture_building_type,
					result.capture_building_build_frames,
					result.capture_building_cost,
					ignored_research_sound,
					unused_academy);
				inspect_upgrade_entry(
					*upgrade_center,
					"Upgrade_AmericaLaserMissiles",
					result.laser_missiles_found,
					result.laser_missiles_display_name,
					result.laser_missiles_type,
					result.laser_missiles_build_frames,
					result.laser_missiles_cost,
					result.laser_missiles_research_sound,
					unused_academy);
				inspect_upgrade_entry(
					*upgrade_center,
					"Upgrade_ChinaMines",
					result.china_mines_found,
					result.china_mines_display_name,
					result.china_mines_type,
					result.china_mines_build_frames,
					result.china_mines_cost,
					result.china_mines_research_sound,
					unused_academy);
				inspect_upgrade_entry(
					*upgrade_center,
					"Upgrade_AmericaRadar",
					result.america_radar_found,
					result.america_radar_display_name,
					result.america_radar_type,
					result.america_radar_build_frames,
					result.america_radar_cost,
					result.america_radar_research_sound,
					result.america_radar_academy_classification);

				result.parsed_fields = count_verified_fields(result);
				result.ok =
					result.bytes > 5000 &&
					result.name_key_generator_loaded &&
					result.original_ini_load &&
					result.parsed_fields == 34;
			}
		}
	} catch (...) {
		result.ok = false;
	}

	TheUpgradeCenter = old_upgrade_center;
	TheNameKeyGenerator = old_name_key_generator;
	TheFileSystem = old_file_system;
	TheArchiveFileSystem = old_archive_file_system;
	TheLocalFileSystem = old_local_file_system;

	if (upgrade_center != nullptr) {
		delete upgrade_center;
	}
	if (name_key_generator != nullptr) {
		delete name_key_generator;
	}

	shutdownMemoryManager();

	return result;
}

RealCommandButtonIniProbeResult probe_original_command_button_ini_load(const char *archive_path)
{
	RealCommandButtonIniProbeResult result;
	result.attempted = true;
	result.source =
		"GameEngine/Common/INI.cpp::load + INICommandButton.cpp + ControlBar.cpp field table + Upgrade.cpp + SpecialPower.cpp";
	result.archive_path = archive_path != nullptr ? archive_path : "";

	AsciiString archive_directory;
	AsciiString archive_mask;
	split_archive_path(archive_path, archive_directory, archive_mask);
	if (archive_mask.isEmpty()) {
		return result;
	}

	initMemoryManager();

	FileSystem *old_file_system = TheFileSystem;
	LocalFileSystem *old_local_file_system = TheLocalFileSystem;
	ArchiveFileSystem *old_archive_file_system = TheArchiveFileSystem;
	NameKeyGenerator *old_name_key_generator = TheNameKeyGenerator;
	SpecialPowerStore *old_special_power_store = TheSpecialPowerStore;
	UpgradeCenter *old_upgrade_center = TheUpgradeCenter;
	ControlBar *old_control_bar = TheControlBar;

	Win32LocalFileSystem local_file_system;
	Win32BIGFileSystem archive_file_system;
	FileSystem file_system;
	NameKeyGenerator *name_key_generator = nullptr;
	SpecialPowerStore *special_power_store = nullptr;
	UpgradeCenter *upgrade_center = nullptr;
	ControlBar *control_bar = nullptr;

	try {
		TheLocalFileSystem = &local_file_system;
		TheArchiveFileSystem = &archive_file_system;
		TheFileSystem = &file_system;

		result.loaded_archives = archive_file_system.loadBigFilesFromDirectory(archive_directory, archive_mask);
		if (result.loaded_archives) {
			FileInfo command_button_file_info = {};
			result.file_exists =
				archive_file_system.getFileInfo(AsciiString(COMMAND_BUTTON_INI_PATH), &command_button_file_info) &&
				command_button_file_info.sizeHigh == 0 &&
				command_button_file_info.sizeLow > 0;
			result.bytes = result.file_exists ?
				static_cast<std::size_t>(command_button_file_info.sizeLow) : 0U;

			FileInfo science_file_info = {};
			result.science_file_exists =
				archive_file_system.getFileInfo(AsciiString(SCIENCE_INI_PATH), &science_file_info) &&
				science_file_info.sizeHigh == 0 &&
				science_file_info.sizeLow > 0;
			result.science_bytes = result.science_file_exists ?
				static_cast<std::size_t>(science_file_info.sizeLow) : 0U;

			FileInfo special_power_file_info = {};
			result.special_power_file_exists =
				archive_file_system.getFileInfo(AsciiString(SPECIAL_POWER_INI_PATH), &special_power_file_info) &&
				special_power_file_info.sizeHigh == 0 &&
				special_power_file_info.sizeLow > 0;
			result.special_power_bytes = result.special_power_file_exists ?
				static_cast<std::size_t>(special_power_file_info.sizeLow) : 0U;

			FileInfo upgrade_file_info = {};
			result.upgrade_file_exists =
				archive_file_system.getFileInfo(AsciiString(UPGRADE_INI_PATH), &upgrade_file_info) &&
				upgrade_file_info.sizeHigh == 0 &&
				upgrade_file_info.sizeLow > 0;
			result.upgrade_bytes = result.upgrade_file_exists ?
				static_cast<std::size_t>(upgrade_file_info.sizeLow) : 0U;

			if (result.file_exists &&
					result.special_power_file_exists &&
					result.upgrade_file_exists) {
				name_key_generator = NEW NameKeyGenerator;
				TheNameKeyGenerator = name_key_generator;
				name_key_generator->init();
				result.name_key_generator_loaded = true;

				special_power_store = NEW SpecialPowerStore;
				TheSpecialPowerStore = special_power_store;
				special_power_store->init();

				upgrade_center = NEW UpgradeCenter;
				TheUpgradeCenter = upgrade_center;
				upgrade_center->init();

				INI upgrade_ini;
				upgrade_ini.load(AsciiString(UPGRADE_INI_PATH), INI_LOAD_OVERWRITE, nullptr);
				result.upgrade_original_ini_load = true;

				std::string shipped_special_powers;
				std::string filtered_special_power;
				if (read_archive_text(file_system, SPECIAL_POWER_INI_PATH, shipped_special_powers)) {
					append_ini_block(
						shipped_special_powers,
						"SpecialPower",
						"SpecialAbilityRangerCaptureBuilding",
						filtered_special_power);
				}
				if (!filtered_special_power.empty() &&
						write_probe_ini_file(SPECIAL_POWER_PROBE_INI_PATH, filtered_special_power)) {
					INI special_power_ini;
					special_power_ini.load(
						AsciiString(SPECIAL_POWER_PROBE_INI_PATH),
						INI_LOAD_OVERWRITE,
						nullptr);
					result.special_power_original_ini_load = true;
				}

				std::string shipped_command_buttons;
				std::string filtered_command_buttons;
				if (read_archive_text(file_system, COMMAND_BUTTON_INI_PATH, shipped_command_buttons)) {
					if (append_command_button_block(
							shipped_command_buttons,
							"Command_UpgradeAmericaRangerFlashBangGrenade",
							filtered_command_buttons)) {
						++result.filtered_blocks;
					}
					if (append_command_button_block(
							shipped_command_buttons,
							"Command_AmericaRangerCaptureBuilding",
							filtered_command_buttons)) {
						++result.filtered_blocks;
					}
					if (append_command_button_block(
							shipped_command_buttons,
							"Command_AmericaRangerSwitchToFlagBangGrenades",
							filtered_command_buttons)) {
						++result.filtered_blocks;
					}
				}

				result.filtered_bytes = filtered_command_buttons.size();
				result.filtered_from_shipped = result.filtered_blocks == 3;
				if (result.filtered_from_shipped && write_probe_ini_file(filtered_command_buttons)) {
					control_bar = NEW ControlBar;
					TheControlBar = control_bar;

					INI command_button_ini;
					command_button_ini.load(
						AsciiString(COMMAND_BUTTON_PROBE_INI_PATH),
						INI_LOAD_OVERWRITE,
						nullptr);
					result.original_ini_load = true;

					result.button_count = count_command_buttons(*control_bar);
					inspect_flash_bang_upgrade_button(*control_bar, result);
					inspect_ranger_capture_button(*control_bar, result);
					inspect_flash_bang_switch_button(*control_bar, result);
					result.special_power_option_pairing_valid =
						command_buttons_have_valid_special_power_options(*control_bar);
					result.parsed_fields = count_verified_fields(result);
					result.ok =
						result.bytes > 100000 &&
						result.special_power_bytes > 5000 &&
						result.upgrade_bytes > 5000 &&
						result.name_key_generator_loaded &&
						result.special_power_original_ini_load &&
						result.upgrade_original_ini_load &&
						result.original_ini_load &&
						result.filtered_bytes > 500 &&
						result.parsed_fields == 34;
				}
			}
		}
	} catch (...) {
		result.ok = false;
	}

	std::remove(COMMAND_BUTTON_PROBE_INI_PATH);
	std::remove(SPECIAL_POWER_PROBE_INI_PATH);

	TheControlBar = old_control_bar;
	TheUpgradeCenter = old_upgrade_center;
	TheSpecialPowerStore = old_special_power_store;
	TheNameKeyGenerator = old_name_key_generator;
	TheFileSystem = old_file_system;
	TheArchiveFileSystem = old_archive_file_system;
	TheLocalFileSystem = old_local_file_system;

	if (control_bar != nullptr) {
		delete control_bar;
	}
	if (upgrade_center != nullptr) {
		delete upgrade_center;
	}
	if (special_power_store != nullptr) {
		delete special_power_store;
	}
	if (name_key_generator != nullptr) {
		delete name_key_generator;
	}

	shutdownMemoryManager();

	return result;
}

RealCommandSetIniProbeResult probe_original_command_set_ini_load(const char *archive_path)
{
	RealCommandSetIniProbeResult result;
	result.attempted = true;
	result.source =
		"GameEngine/Common/INI.cpp::load + INICommandSet.cpp + ControlBar.cpp CommandSet parser";
	result.archive_path = archive_path != nullptr ? archive_path : "";

	AsciiString archive_directory;
	AsciiString archive_mask;
	split_archive_path(archive_path, archive_directory, archive_mask);
	if (archive_mask.isEmpty()) {
		return result;
	}

	initMemoryManager();

	FileSystem *old_file_system = TheFileSystem;
	LocalFileSystem *old_local_file_system = TheLocalFileSystem;
	ArchiveFileSystem *old_archive_file_system = TheArchiveFileSystem;
	NameKeyGenerator *old_name_key_generator = TheNameKeyGenerator;
	SpecialPowerStore *old_special_power_store = TheSpecialPowerStore;
	UpgradeCenter *old_upgrade_center = TheUpgradeCenter;
	ControlBar *old_control_bar = TheControlBar;

	Win32LocalFileSystem local_file_system;
	Win32BIGFileSystem archive_file_system;
	FileSystem file_system;
	NameKeyGenerator *name_key_generator = nullptr;
	SpecialPowerStore *special_power_store = nullptr;
	UpgradeCenter *upgrade_center = nullptr;
	ControlBar *control_bar = nullptr;

	try {
		TheLocalFileSystem = &local_file_system;
		TheArchiveFileSystem = &archive_file_system;
		TheFileSystem = &file_system;

		result.loaded_archives = archive_file_system.loadBigFilesFromDirectory(archive_directory, archive_mask);
		if (result.loaded_archives) {
			FileInfo command_set_file_info = {};
			result.file_exists =
				archive_file_system.getFileInfo(AsciiString(COMMAND_SET_INI_PATH), &command_set_file_info) &&
				command_set_file_info.sizeHigh == 0 &&
				command_set_file_info.sizeLow > 0;
			result.bytes = result.file_exists ?
				static_cast<std::size_t>(command_set_file_info.sizeLow) : 0U;

			FileInfo command_button_file_info = {};
			result.command_button_file_exists =
				archive_file_system.getFileInfo(AsciiString(COMMAND_BUTTON_INI_PATH), &command_button_file_info) &&
				command_button_file_info.sizeHigh == 0 &&
				command_button_file_info.sizeLow > 0;
			result.command_button_bytes = result.command_button_file_exists ?
				static_cast<std::size_t>(command_button_file_info.sizeLow) : 0U;

			FileInfo special_power_file_info = {};
			result.special_power_file_exists =
				archive_file_system.getFileInfo(AsciiString(SPECIAL_POWER_INI_PATH), &special_power_file_info) &&
				special_power_file_info.sizeHigh == 0 &&
				special_power_file_info.sizeLow > 0;
			result.special_power_bytes = result.special_power_file_exists ?
				static_cast<std::size_t>(special_power_file_info.sizeLow) : 0U;

			FileInfo upgrade_file_info = {};
			result.upgrade_file_exists =
				archive_file_system.getFileInfo(AsciiString(UPGRADE_INI_PATH), &upgrade_file_info) &&
				upgrade_file_info.sizeHigh == 0 &&
				upgrade_file_info.sizeLow > 0;
			result.upgrade_bytes = result.upgrade_file_exists ?
				static_cast<std::size_t>(upgrade_file_info.sizeLow) : 0U;

			if (result.file_exists &&
					result.command_button_file_exists &&
					result.special_power_file_exists &&
					result.upgrade_file_exists) {
				name_key_generator = NEW NameKeyGenerator;
				TheNameKeyGenerator = name_key_generator;
				name_key_generator->init();
				result.name_key_generator_loaded = true;

				special_power_store = NEW SpecialPowerStore;
				TheSpecialPowerStore = special_power_store;
				special_power_store->init();

				upgrade_center = NEW UpgradeCenter;
				TheUpgradeCenter = upgrade_center;
				upgrade_center->init();

				INI upgrade_ini;
				upgrade_ini.load(AsciiString(UPGRADE_INI_PATH), INI_LOAD_OVERWRITE, nullptr);
				result.upgrade_original_ini_load = true;

				std::string shipped_special_powers;
				std::string filtered_special_power;
				if (read_archive_text(file_system, SPECIAL_POWER_INI_PATH, shipped_special_powers)) {
					append_ini_block(
						shipped_special_powers,
						"SpecialPower",
						"SpecialAbilityRangerCaptureBuilding",
						filtered_special_power);
				}
				if (!filtered_special_power.empty() &&
						write_probe_ini_file(SPECIAL_POWER_PROBE_INI_PATH, filtered_special_power)) {
					INI special_power_ini;
					special_power_ini.load(
						AsciiString(SPECIAL_POWER_PROBE_INI_PATH),
						INI_LOAD_OVERWRITE,
						nullptr);
					result.special_power_original_ini_load = true;
				}

				std::string shipped_command_buttons;
				std::string filtered_command_buttons;
				if (read_archive_text(file_system, COMMAND_BUTTON_INI_PATH, shipped_command_buttons)) {
					if (append_command_button_block(
							shipped_command_buttons,
							"Command_AmericaRangerCaptureBuilding",
							filtered_command_buttons)) {
						++result.filtered_command_button_blocks;
					}
					if (append_command_button_block(
							shipped_command_buttons,
							"Command_AmericaRangerSwitchToMachineGun",
							filtered_command_buttons)) {
						++result.filtered_command_button_blocks;
					}
					if (append_command_button_block(
							shipped_command_buttons,
							"Command_AmericaRangerSwitchToFlagBangGrenades",
							filtered_command_buttons)) {
						++result.filtered_command_button_blocks;
					}
					if (append_command_button_block(
							shipped_command_buttons,
							"Command_AttackMove",
							filtered_command_buttons)) {
						++result.filtered_command_button_blocks;
					}
					if (append_command_button_block(
							shipped_command_buttons,
							"Command_Guard",
							filtered_command_buttons)) {
						++result.filtered_command_button_blocks;
					}
					if (append_command_button_block(
							shipped_command_buttons,
							"Command_Stop",
							filtered_command_buttons)) {
						++result.filtered_command_button_blocks;
					}
				}
				result.filtered_command_button_bytes = filtered_command_buttons.size();

				std::string shipped_command_sets;
				std::string filtered_command_set;
				if (read_archive_text(file_system, COMMAND_SET_INI_PATH, shipped_command_sets) &&
						append_command_set_block(
							shipped_command_sets,
							"AmericaInfantryRangerCommandSet",
							filtered_command_set)) {
					++result.filtered_command_set_blocks;
				}
				result.filtered_command_set_bytes = filtered_command_set.size();
				result.filtered_from_shipped =
					result.filtered_command_button_blocks == 6 &&
					result.filtered_command_set_blocks == 1;

				if (result.filtered_from_shipped &&
						write_probe_ini_file(COMMAND_BUTTON_PROBE_INI_PATH, filtered_command_buttons) &&
						write_probe_ini_file(COMMAND_SET_PROBE_INI_PATH, filtered_command_set)) {
					control_bar = NEW ControlBar;
					TheControlBar = control_bar;

					INI command_button_ini;
					command_button_ini.load(
						AsciiString(COMMAND_BUTTON_PROBE_INI_PATH),
						INI_LOAD_OVERWRITE,
						nullptr);
					result.command_button_original_ini_load = true;
					result.command_button_count = count_command_buttons(*control_bar);

					INI command_set_ini;
					command_set_ini.load(
						AsciiString(COMMAND_SET_PROBE_INI_PATH),
						INI_LOAD_OVERWRITE,
						nullptr);
					result.original_ini_load = true;

					inspect_ranger_command_set(*control_bar, result);
					result.parsed_fields = count_verified_fields(result);
					result.ok =
						result.bytes > 50000 &&
						result.command_button_bytes > 100000 &&
						result.special_power_bytes > 5000 &&
						result.upgrade_bytes > 5000 &&
						result.name_key_generator_loaded &&
						result.special_power_original_ini_load &&
						result.upgrade_original_ini_load &&
						result.command_button_original_ini_load &&
						result.original_ini_load &&
						result.filtered_command_button_bytes > 1000 &&
						result.filtered_command_set_bytes > 200 &&
						result.parsed_fields == 23;
				}
			}
		}
	} catch (...) {
		result.ok = false;
	}

	std::remove(COMMAND_SET_PROBE_INI_PATH);
	std::remove(COMMAND_BUTTON_PROBE_INI_PATH);
	std::remove(SPECIAL_POWER_PROBE_INI_PATH);

	TheControlBar = old_control_bar;
	TheUpgradeCenter = old_upgrade_center;
	TheSpecialPowerStore = old_special_power_store;
	TheNameKeyGenerator = old_name_key_generator;
	TheFileSystem = old_file_system;
	TheArchiveFileSystem = old_archive_file_system;
	TheLocalFileSystem = old_local_file_system;

	if (control_bar != nullptr) {
		delete control_bar;
	}
	if (upgrade_center != nullptr) {
		delete upgrade_center;
	}
	if (special_power_store != nullptr) {
		delete special_power_store;
	}
	if (name_key_generator != nullptr) {
		delete name_key_generator;
	}

	shutdownMemoryManager();

	return result;
}

RealWeatherIniProbeResult probe_original_weather_ini_load(const char *archive_path)
{
	RealWeatherIniProbeResult result;
	result.attempted = true;
	result.source = "GameEngine/Common/INI.cpp::load + GameClient/Snow.cpp";
	result.archive_path = archive_path != nullptr ? archive_path : "";

	AsciiString archive_directory;
	AsciiString archive_mask;
	split_archive_path(archive_path, archive_directory, archive_mask);
	if (archive_mask.isEmpty()) {
		return result;
	}

	initMemoryManager();

	FileSystem *old_file_system = TheFileSystem;
	LocalFileSystem *old_local_file_system = TheLocalFileSystem;
	ArchiveFileSystem *old_archive_file_system = TheArchiveFileSystem;
	OVERRIDE<WeatherSetting> old_weather_setting = TheWeatherSetting;
	SnowManager *old_snow_manager = TheSnowManager;

	Win32LocalFileSystem local_file_system;
	Win32BIGFileSystem archive_file_system;
	FileSystem file_system;
	WeatherSetting *weather_setting_to_delete = nullptr;

	try {
		TheLocalFileSystem = &local_file_system;
		TheArchiveFileSystem = &archive_file_system;
		TheFileSystem = &file_system;
		TheWeatherSetting = nullptr;
		TheSnowManager = nullptr;

		result.loaded_archives = archive_file_system.loadBigFilesFromDirectory(archive_directory, archive_mask);
		if (result.loaded_archives) {
			FileInfo file_info = {};
			result.file_exists =
				archive_file_system.getFileInfo(AsciiString(WEATHER_INI_PATH), &file_info) &&
				file_info.sizeHigh == 0 &&
				file_info.sizeLow > 0;
			result.bytes = result.file_exists ? static_cast<std::size_t>(file_info.sizeLow) : 0U;

			if (result.file_exists) {
				INI ini;
				ini.load(AsciiString(WEATHER_INI_PATH), INI_LOAD_OVERWRITE, nullptr);
				result.original_ini_load = true;

				weather_setting_to_delete =
					const_cast<WeatherSetting *>(TheWeatherSetting.getNonOverloadedPointer());
				const WeatherSetting *weather_setting = TheWeatherSetting;
				if (weather_setting != nullptr) {
					result.snow_texture = weather_setting->m_snowTexture.str();
					result.snow_enabled = weather_setting->m_snowEnabled;
					result.use_point_sprites = weather_setting->m_usePointSprites;
					result.snow_box_dimensions = weather_setting->m_snowBoxDimensions;
					result.snow_box_density = weather_setting->m_snowBoxDensity;
					result.snow_frequency_scale_x = weather_setting->m_snowFrequencyScaleX;
					result.snow_frequency_scale_y = weather_setting->m_snowFrequencyScaleY;
					result.snow_amplitude = weather_setting->m_snowAmplitude;
					result.snow_velocity = weather_setting->m_snowVelocity;
					result.snow_point_size = weather_setting->m_snowPointSize;
					result.snow_quad_size = weather_setting->m_snowQuadSize;
					result.snow_max_point_size = weather_setting->m_snowMaxPointSize;
					result.snow_min_point_size = weather_setting->m_snowMinPointSize;
					result.parsed_fields = count_verified_fields(result);
				}

				result.ok =
					result.bytes > 1000 &&
					result.original_ini_load &&
					result.parsed_fields == 13;
			}
		}
	} catch (...) {
		result.ok = false;
	}

	if (weather_setting_to_delete == nullptr) {
		weather_setting_to_delete =
			const_cast<WeatherSetting *>(TheWeatherSetting.getNonOverloadedPointer());
	}

	TheWeatherSetting = old_weather_setting;
	TheSnowManager = old_snow_manager;
	TheFileSystem = old_file_system;
	TheArchiveFileSystem = old_archive_file_system;
	TheLocalFileSystem = old_local_file_system;

	if (weather_setting_to_delete != nullptr) {
		weather_setting_to_delete->deleteInstance();
	}

	shutdownMemoryManager();

	return result;
}

RealMapCacheIniProbeResult probe_original_map_cache_ini_load(const char *archive_path)
{
	RealMapCacheIniProbeResult result;
	result.attempted = true;
	result.source = "GameEngine/Common/INI.cpp::load + INIMapCache.cpp";
	result.archive_path = archive_path != nullptr ? archive_path : "";

	AsciiString archive_directory;
	AsciiString archive_mask;
	split_archive_path(archive_path, archive_directory, archive_mask);
	if (archive_mask.isEmpty()) {
		return result;
	}

	initMemoryManager();

	FileSystem *old_file_system = TheFileSystem;
	LocalFileSystem *old_local_file_system = TheLocalFileSystem;
	ArchiveFileSystem *old_archive_file_system = TheArchiveFileSystem;
	GameTextInterface *old_game_text = TheGameText;
	NameKeyGenerator *old_name_key_generator = TheNameKeyGenerator;
	MapCache *old_map_cache = TheMapCache;

	Win32LocalFileSystem local_file_system;
	Win32BIGFileSystem archive_file_system;
	FileSystem file_system;
	GameTextInterface *game_text = nullptr;
	NameKeyGenerator *name_key_generator = nullptr;
	MapCache map_cache;

	try {
		TheLocalFileSystem = &local_file_system;
		TheArchiveFileSystem = &archive_file_system;
		TheFileSystem = &file_system;

		result.loaded_archives = archive_file_system.loadBigFilesFromDirectory(archive_directory, archive_mask);
		if (result.loaded_archives) {
			FileInfo file_info = {};
			result.file_exists =
				archive_file_system.getFileInfo(AsciiString(MAP_CACHE_INI_PATH), &file_info) &&
				file_info.sizeHigh == 0 &&
				file_info.sizeLow > 0;
			result.bytes = result.file_exists ? static_cast<std::size_t>(file_info.sizeLow) : 0U;

			if (result.file_exists) {
				name_key_generator = NEW NameKeyGenerator;
				TheNameKeyGenerator = name_key_generator;
				name_key_generator->init();
				result.name_key_generator_loaded = true;

				game_text = CreateGameTextInterface();
				TheGameText = game_text;
				if (game_text != nullptr) {
					game_text->init();
					Bool title_exists = FALSE;
					const UnicodeString title = game_text->fetch("GUI:Command&ConquerGenerals", &title_exists);
					result.game_text_loaded = title_exists && unicode_not_empty(title);
				}

				TheMapCache = &map_cache;

				INI ini;
				ini.load(AsciiString(MAP_CACHE_INI_PATH), INI_LOAD_OVERWRITE, nullptr);
				result.original_ini_load = true;

				for (MapCache::const_iterator it = map_cache.begin(); it != map_cache.end(); ++it) {
					if (it->second.m_isMultiplayer) {
						++result.multiplayer_count;
					}
					if (it->second.m_isOfficial) {
						++result.official_count;
					}
				}

				result.map_count = map_cache.size();
				inspect_map_cache_entry(
					map_cache,
					SHELL_MAP_MD_PATH,
					result.has_shell_map_md,
					result.shell_map_md_display_name,
					result.shell_map_md_players);
				inspect_map_cache_entry(
					map_cache,
					TOURNAMENT_DESERT_PATH,
					result.has_tournament_desert,
					result.tournament_desert_display_name,
					result.tournament_desert_players);

				result.ok =
					result.bytes > 100000 &&
					result.game_text_loaded &&
					result.name_key_generator_loaded &&
					result.original_ini_load &&
					result.map_count > 80 &&
					result.multiplayer_count > 20 &&
					result.official_count > 20 &&
					result.has_shell_map_md &&
					result.has_tournament_desert &&
					result.tournament_desert_display_name &&
					result.tournament_desert_players >= 2;
			}
		}
	} catch (...) {
		result.ok = false;
	}

	TheMapCache = old_map_cache;
	TheNameKeyGenerator = old_name_key_generator;
	TheGameText = old_game_text;
	TheFileSystem = old_file_system;
	TheArchiveFileSystem = old_archive_file_system;
	TheLocalFileSystem = old_local_file_system;

	if (game_text != nullptr) {
		delete game_text;
	}
	if (name_key_generator != nullptr) {
		delete name_key_generator;
	}
	map_cache.clear();

	shutdownMemoryManager();

	return result;
}
