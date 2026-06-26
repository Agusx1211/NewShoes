#include "wasm_archive_probe.h"
#include "wasm_real_ini_probe.h"

#include <algorithm>
#include <cstddef>
#include <string>
#include <vector>

#include "PreRTS.h"

#include "Common/ArchiveFileSystem.h"
#include "Common/File.h"
#include "Common/FileSystem.h"
#include "Common/GameMemory.h"
#include "Common/GlobalData.h"
#include "Common/LocalFileSystem.h"
#include "Common/SubsystemInterface.h"
#include "Common/UnicodeString.h"
#include "GameClient/GameText.h"
#include "Win32Device/Common/Win32BIGFileSystem.h"
#include "Win32Device/Common/Win32LocalFileSystem.h"

SubsystemInterfaceList *TheSubsystemList = nullptr;
GlobalData *TheGlobalData = nullptr;
HWND ApplicationHWnd = NULL;
const Char *g_strFile = "Data\\Generals.str";
const Char *g_csfFile = "Data\\%s\\Generals.csf";

namespace {
constexpr const char ARMOR_INI_PATH[] = "Data\\INI\\Armor.ini";
constexpr const char DAMAGE_FX_INI_PATH[] = "Data\\INI\\DamageFX.ini";
constexpr const char DEFAULT_AI_DATA_INI_PATH[] = "Data\\INI\\Default\\AIData.ini";
constexpr const char AI_DATA_INI_PATH[] = "Data\\INI\\AIData.ini";
constexpr const char LOCOMOTOR_INI_PATH[] = "Data\\INI\\Locomotor.ini";
constexpr const char GAME_DATA_INI_PATH[] = "Data\\INI\\GameData.ini";
constexpr const char SCIENCE_INI_PATH[] = "Data\\INI\\Science.ini";
constexpr const char SPECIAL_POWER_INI_PATH[] = "Data\\INI\\SpecialPower.ini";
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
constexpr const char UPGRADE_INI_PATH[] = "Data\\INI\\Upgrade.ini";
constexpr const char PARTICLE_SYSTEM_INI_PATH[] = "Data\\INI\\ParticleSystem.ini";
constexpr const char WEAPON_INI_PATH[] = "Data\\INI\\Weapon.ini";
constexpr const char MAP_CACHE_INI_PATH[] = "Maps\\MapCache.ini";
constexpr const char DEFAULT_VIDEO_INI_PATH[] = "Data\\INI\\Default\\Video.ini";
constexpr const char VIDEO_INI_PATH[] = "Data\\INI\\Video.ini";
constexpr const char WATER_INI_PATH[] = "Data\\INI\\Water.ini";
constexpr const char WEATHER_INI_PATH[] = "Data\\INI\\Weather.ini";

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

bool read_archive_file(FileSystem &file_system, const char *path, std::vector<char> &data)
{
	FileInfo info = {};
	if (!file_system.getFileInfo(AsciiString(path), &info) || info.sizeHigh != 0 || info.sizeLow <= 0) {
		return false;
	}

	File *file = file_system.openFile(path, File::READ | File::BINARY);
	if (file == nullptr) {
		return false;
	}

	data.assign(static_cast<std::size_t>(info.sizeLow), 0);
	const Int bytes_read = file->read(data.data(), info.sizeLow);
	file->close();
	return bytes_read == info.sizeLow;
}

bool read_first_indexed_archive_file(
	ArchiveFileSystem &archive_file_system,
	FileSystem &file_system,
	std::vector<char> &data,
	std::size_t &indexed_file_count)
{
	FilenameList files;
	archive_file_system.getFileListInDirectory(
		AsciiString(""), AsciiString(""), AsciiString("*"), files, TRUE);
	indexed_file_count = files.size();

	for (FilenameListIter it = files.begin(); it != files.end(); ++it) {
		FileInfo info = {};
		if (!archive_file_system.getFileInfo(*it, &info) ||
				info.sizeHigh != 0 || info.sizeLow <= 0) {
			continue;
		}

		if (read_archive_file(file_system, it->str(), data)) {
			return true;
		}
	}

	return false;
}

void copy_armor_probe(const RealArmorIniProbeResult &armor, ArchiveProbeResult &result)
{
	result.armor_attempted = armor.attempted;
	result.armor_ok = armor.ok;
	result.armor_loaded_archives = armor.loaded_archives;
	result.armor_file_exists = armor.file_exists;
	result.armor_name_key_generator_loaded = armor.name_key_generator_loaded;
	result.armor_original_ini_load = armor.original_ini_load;
	result.armor_bytes = armor.bytes;
	result.armor_parsed_fields = armor.parsed_fields;
	result.armor_source = armor.source;
	result.armor_no_armor_found = armor.no_armor_found;
	result.armor_human_armor_found = armor.human_armor_found;
	result.armor_tank_armor_found = armor.tank_armor_found;
	result.armor_no_armor_explosion_damage = armor.no_armor_explosion_damage;
	result.armor_no_armor_hazard_cleanup_damage = armor.no_armor_hazard_cleanup_damage;
	result.armor_human_crush_damage = armor.human_crush_damage;
	result.armor_human_armor_piercing_damage = armor.human_armor_piercing_damage;
	result.armor_human_flame_damage = armor.human_flame_damage;
	result.armor_tank_small_arms_damage = armor.tank_small_arms_damage;
	result.armor_tank_radiation_damage = armor.tank_radiation_damage;
	result.armor_tank_microwave_damage = armor.tank_microwave_damage;
}

void copy_damage_fx_probe(const RealDamageFXIniProbeResult &damage_fx, ArchiveProbeResult &result)
{
	result.damage_fx_attempted = damage_fx.attempted;
	result.damage_fx_ok = damage_fx.ok;
	result.damage_fx_loaded_archives = damage_fx.loaded_archives;
	result.damage_fx_file_exists = damage_fx.file_exists;
	result.damage_fx_name_key_generator_loaded = damage_fx.name_key_generator_loaded;
	result.damage_fx_fx_list_store_loaded = damage_fx.fx_list_store_loaded;
	result.damage_fx_store_loaded = damage_fx.damage_fx_store_loaded;
	result.damage_fx_original_ini_load = damage_fx.original_ini_load;
	result.damage_fx_bytes = damage_fx.bytes;
	result.damage_fx_parsed_fields = damage_fx.parsed_fields;
	result.damage_fx_source = damage_fx.source;
	result.damage_fx_default_found = damage_fx.default_damage_fx_found;
	result.damage_fx_tank_found = damage_fx.tank_damage_fx_found;
	result.damage_fx_small_tank_found = damage_fx.small_tank_damage_fx_found;
	result.damage_fx_structure_found = damage_fx.structure_damage_fx_found;
	result.damage_fx_infantry_found = damage_fx.infantry_damage_fx_found;
	result.damage_fx_default_explosion_throttle =
		damage_fx.default_explosion_throttle;
	result.damage_fx_tank_small_arms_throttle =
		damage_fx.tank_small_arms_throttle;
	result.damage_fx_small_tank_comanche_throttle =
		damage_fx.small_tank_comanche_throttle;
	result.damage_fx_structure_flame_throttle =
		damage_fx.structure_flame_throttle;
	result.damage_fx_infantry_sniper_throttle =
		damage_fx.infantry_sniper_throttle;
}

void copy_weapon_probe(const RealWeaponIniProbeResult &weapon, ArchiveProbeResult &result)
{
	result.weapon_attempted = weapon.attempted;
	result.weapon_ok = weapon.ok;
	result.weapon_loaded_archives = weapon.loaded_archives;
	result.weapon_file_exists = weapon.file_exists;
	result.weapon_particle_file_exists = weapon.particle_file_exists;
	result.weapon_name_key_generator_loaded = weapon.name_key_generator_loaded;
	result.weapon_fx_list_store_loaded = weapon.fx_list_store_loaded;
	result.weapon_particle_system_manager_loaded =
		weapon.particle_system_manager_loaded;
	result.weapon_store_loaded = weapon.weapon_store_loaded;
	result.weapon_particle_original_ini_load = weapon.particle_original_ini_load;
	result.weapon_original_ini_load = weapon.original_ini_load;
	result.weapon_bytes = weapon.bytes;
	result.weapon_particle_bytes = weapon.particle_bytes;
	result.weapon_particle_template_count = weapon.particle_template_count;
	result.weapon_parsed_fields = weapon.parsed_fields;
	result.weapon_source = weapon.source;
	result.weapon_tomahawk_exhaust_template_found =
		weapon.tomahawk_exhaust_template_found;
	result.weapon_heroic_tomahawk_exhaust_template_found =
		weapon.heroic_tomahawk_exhaust_template_found;
	result.weapon_ranger_found = weapon.ranger_found;
	result.weapon_crusader_found = weapon.crusader_found;
	result.weapon_tomahawk_found = weapon.tomahawk_found;
	result.weapon_ranger_primary_damage = weapon.ranger_primary_damage;
	result.weapon_ranger_attack_range = weapon.ranger_attack_range;
	result.weapon_ranger_delay_frames = weapon.ranger_delay_frames;
	result.weapon_ranger_clip_size = weapon.ranger_clip_size;
	result.weapon_ranger_clip_reload_frames = weapon.ranger_clip_reload_frames;
	result.weapon_ranger_damage_type = weapon.ranger_damage_type;
	result.weapon_ranger_death_type = weapon.ranger_death_type;
	result.weapon_ranger_fire_sound = weapon.ranger_fire_sound;
	result.weapon_crusader_primary_damage = weapon.crusader_primary_damage;
	result.weapon_crusader_primary_damage_radius = weapon.crusader_primary_damage_radius;
	result.weapon_crusader_attack_range = weapon.crusader_attack_range;
	result.weapon_crusader_delay_frames = weapon.crusader_delay_frames;
	result.weapon_crusader_clip_size = weapon.crusader_clip_size;
	result.weapon_crusader_damage_type = weapon.crusader_damage_type;
	result.weapon_crusader_death_type = weapon.crusader_death_type;
	result.weapon_crusader_fire_sound = weapon.crusader_fire_sound;
	result.weapon_tomahawk_primary_damage = weapon.tomahawk_primary_damage;
	result.weapon_tomahawk_primary_damage_radius =
		weapon.tomahawk_primary_damage_radius;
	result.weapon_tomahawk_secondary_damage = weapon.tomahawk_secondary_damage;
	result.weapon_tomahawk_secondary_damage_radius =
		weapon.tomahawk_secondary_damage_radius;
	result.weapon_tomahawk_attack_range = weapon.tomahawk_attack_range;
	result.weapon_tomahawk_minimum_attack_range =
		weapon.tomahawk_minimum_attack_range;
	result.weapon_tomahawk_pre_attack_delay_frames =
		weapon.tomahawk_pre_attack_delay_frames;
	result.weapon_tomahawk_delay_frames = weapon.tomahawk_delay_frames;
	result.weapon_tomahawk_clip_size = weapon.tomahawk_clip_size;
	result.weapon_tomahawk_clip_reload_frames = weapon.tomahawk_clip_reload_frames;
	result.weapon_tomahawk_damage_type = weapon.tomahawk_damage_type;
	result.weapon_tomahawk_death_type = weapon.tomahawk_death_type;
	result.weapon_tomahawk_fire_sound = weapon.tomahawk_fire_sound;
	result.weapon_tomahawk_projectile_exhaust_loaded =
		weapon.tomahawk_projectile_exhaust_loaded;
	result.weapon_tomahawk_heroic_projectile_exhaust_loaded =
		weapon.tomahawk_heroic_projectile_exhaust_loaded;
}

void copy_ai_data_probe(const RealAIDataIniProbeResult &ai_data, ArchiveProbeResult &result)
{
	result.ai_data_attempted = ai_data.attempted;
	result.ai_data_ok = ai_data.ok;
	result.ai_data_loaded_archives = ai_data.loaded_archives;
	result.ai_data_default_file_exists = ai_data.default_file_exists;
	result.ai_data_override_file_exists = ai_data.override_file_exists;
	result.ai_data_science_file_exists = ai_data.science_file_exists;
	result.ai_data_science_store_loaded = ai_data.science_store_loaded;
	result.ai_data_ai_loaded = ai_data.ai_loaded;
	result.ai_data_science_original_ini_load = ai_data.science_original_ini_load;
	result.ai_data_default_original_ini_load = ai_data.default_original_ini_load;
	result.ai_data_override_original_ini_load = ai_data.override_original_ini_load;
	result.ai_data_bytes = ai_data.bytes;
	result.ai_data_science_bytes = ai_data.science_bytes;
	result.ai_data_parsed_fields = ai_data.parsed_fields;
	result.ai_data_source = ai_data.source;
	result.ai_data_structure_seconds = ai_data.structure_seconds;
	result.ai_data_team_seconds = ai_data.team_seconds;
	result.ai_data_resources_wealthy = ai_data.resources_wealthy;
	result.ai_data_resources_poor = ai_data.resources_poor;
	result.ai_data_force_idle_frames = ai_data.force_idle_frames;
	result.ai_data_structures_wealthy_rate = ai_data.structures_wealthy_rate;
	result.ai_data_teams_wealthy_rate = ai_data.teams_wealthy_rate;
	result.ai_data_structures_poor_rate = ai_data.structures_poor_rate;
	result.ai_data_teams_poor_rate = ai_data.teams_poor_rate;
	result.ai_data_team_resources_to_start = ai_data.team_resources_to_start;
	result.ai_data_guard_inner_modifier_ai = ai_data.guard_inner_modifier_ai;
	result.ai_data_guard_outer_modifier_ai = ai_data.guard_outer_modifier_ai;
	result.ai_data_guard_inner_modifier_human = ai_data.guard_inner_modifier_human;
	result.ai_data_guard_outer_modifier_human = ai_data.guard_outer_modifier_human;
	result.ai_data_guard_chase_unit_frames = ai_data.guard_chase_unit_frames;
	result.ai_data_guard_enemy_scan_frames = ai_data.guard_enemy_scan_frames;
	result.ai_data_guard_enemy_return_scan_frames =
		ai_data.guard_enemy_return_scan_frames;
	result.ai_data_attack_priority_distance_modifier =
		ai_data.attack_priority_distance_modifier;
	result.ai_data_max_recruit_radius = ai_data.max_recruit_radius;
	result.ai_data_skirmish_base_defense_extra_distance =
		ai_data.skirmish_base_defense_extra_distance;
	result.ai_data_wall_height = ai_data.wall_height;
	result.ai_data_attack_uses_line_of_sight = ai_data.attack_uses_line_of_sight;
	result.ai_data_attack_ignore_insignificant_buildings =
		ai_data.attack_ignore_insignificant_buildings;
	result.ai_data_enable_repulsors = ai_data.enable_repulsors;
	result.ai_data_min_infantry_for_group = ai_data.min_infantry_for_group;
	result.ai_data_min_vehicles_for_group = ai_data.min_vehicles_for_group;
	result.ai_data_min_distance_for_group = ai_data.min_distance_for_group;
	result.ai_data_distance_requires_group = ai_data.distance_requires_group;
	result.ai_data_supply_center_safe_radius = ai_data.supply_center_safe_radius;
	result.ai_data_rebuild_delay_seconds = ai_data.rebuild_delay_seconds;
	result.ai_data_ai_crushes_infantry = ai_data.ai_crushes_infantry;
	result.ai_data_side_info_count = ai_data.side_info_count;
	result.ai_data_build_list_count = ai_data.build_list_count;
	result.ai_data_america_side_found = ai_data.america_side_found;
	result.ai_data_america_resource_gatherers_easy =
		ai_data.america_resource_gatherers_easy;
	result.ai_data_america_resource_gatherers_normal =
		ai_data.america_resource_gatherers_normal;
	result.ai_data_america_resource_gatherers_hard =
		ai_data.america_resource_gatherers_hard;
	result.ai_data_america_base_defense_structure =
		ai_data.america_base_defense_structure;
	result.ai_data_america_skill_set1_count = ai_data.america_skill_set1_count;
	result.ai_data_america_skill_set1_first_science =
		ai_data.america_skill_set1_first_science;
	result.ai_data_gla_side_found = ai_data.gla_side_found;
	result.ai_data_gla_resource_gatherers_easy =
		ai_data.gla_resource_gatherers_easy;
	result.ai_data_gla_base_defense_structure = ai_data.gla_base_defense_structure;
	result.ai_data_america_build_list_found = ai_data.america_build_list_found;
	result.ai_data_america_build_list_structure_count =
		ai_data.america_build_list_structure_count;
	result.ai_data_america_first_build_template =
		ai_data.america_first_build_template;
	result.ai_data_america_first_build_x = ai_data.america_first_build_x;
	result.ai_data_america_first_build_y = ai_data.america_first_build_y;
	result.ai_data_america_first_build_angle = ai_data.america_first_build_angle;
	result.ai_data_america_first_build_automatically_build =
		ai_data.america_first_build_automatically_build;
}

void copy_locomotor_probe(const RealLocomotorIniProbeResult &locomotor, ArchiveProbeResult &result)
{
	result.locomotor_attempted = locomotor.attempted;
	result.locomotor_ok = locomotor.ok;
	result.locomotor_loaded_archives = locomotor.loaded_archives;
	result.locomotor_file_exists = locomotor.file_exists;
	result.locomotor_name_key_generator_loaded =
		locomotor.name_key_generator_loaded;
	result.locomotor_store_loaded = locomotor.locomotor_store_loaded;
	result.locomotor_original_ini_load = locomotor.original_ini_load;
	result.locomotor_bytes = locomotor.bytes;
	result.locomotor_parsed_fields = locomotor.parsed_fields;
	result.locomotor_template_count = locomotor.template_count;
	result.locomotor_source = locomotor.source;
	result.locomotor_basic_human_found = locomotor.basic_human_found;
	result.locomotor_missile_defender_found = locomotor.missile_defender_found;
	result.locomotor_humvee_found = locomotor.humvee_found;
	result.locomotor_comanche_found = locomotor.comanche_found;
	result.locomotor_basic_human_speed = locomotor.basic_human_speed;
	result.locomotor_basic_human_speed_damaged =
		locomotor.basic_human_speed_damaged;
	result.locomotor_basic_human_turn_rate = locomotor.basic_human_turn_rate;
	result.locomotor_basic_human_acceleration =
		locomotor.basic_human_acceleration;
	result.locomotor_basic_human_braking = locomotor.basic_human_braking;
	result.locomotor_basic_human_surfaces = locomotor.basic_human_surfaces;
	result.locomotor_basic_human_appearance = locomotor.basic_human_appearance;
	result.locomotor_basic_human_z_behavior = locomotor.basic_human_z_behavior;
	result.locomotor_basic_human_move_priority =
		locomotor.basic_human_move_priority;
	result.locomotor_basic_human_stick_to_ground =
		locomotor.basic_human_stick_to_ground;
	result.locomotor_missile_defender_speed = locomotor.missile_defender_speed;
	result.locomotor_missile_defender_move_priority =
		locomotor.missile_defender_move_priority;
	result.locomotor_humvee_speed = locomotor.humvee_speed;
	result.locomotor_humvee_speed_damaged = locomotor.humvee_speed_damaged;
	result.locomotor_humvee_turn_rate = locomotor.humvee_turn_rate;
	result.locomotor_humvee_acceleration = locomotor.humvee_acceleration;
	result.locomotor_humvee_braking = locomotor.humvee_braking;
	result.locomotor_humvee_min_turn_speed = locomotor.humvee_min_turn_speed;
	result.locomotor_humvee_turn_pivot_offset =
		locomotor.humvee_turn_pivot_offset;
	result.locomotor_humvee_wheel_turn_angle =
		locomotor.humvee_wheel_turn_angle;
	result.locomotor_humvee_max_wheel_extension =
		locomotor.humvee_max_wheel_extension;
	result.locomotor_humvee_max_wheel_compression =
		locomotor.humvee_max_wheel_compression;
	result.locomotor_humvee_surfaces = locomotor.humvee_surfaces;
	result.locomotor_humvee_appearance = locomotor.humvee_appearance;
	result.locomotor_humvee_z_behavior = locomotor.humvee_z_behavior;
	result.locomotor_humvee_stick_to_ground = locomotor.humvee_stick_to_ground;
	result.locomotor_humvee_has_suspension = locomotor.humvee_has_suspension;
	result.locomotor_humvee_can_move_backward =
		locomotor.humvee_can_move_backward;
	result.locomotor_comanche_speed = locomotor.comanche_speed;
	result.locomotor_comanche_speed_damaged =
		locomotor.comanche_speed_damaged;
	result.locomotor_comanche_turn_rate = locomotor.comanche_turn_rate;
	result.locomotor_comanche_acceleration = locomotor.comanche_acceleration;
	result.locomotor_comanche_lift = locomotor.comanche_lift;
	result.locomotor_comanche_lift_damaged = locomotor.comanche_lift_damaged;
	result.locomotor_comanche_braking = locomotor.comanche_braking;
	result.locomotor_comanche_preferred_height =
		locomotor.comanche_preferred_height;
	result.locomotor_comanche_surfaces = locomotor.comanche_surfaces;
	result.locomotor_comanche_appearance = locomotor.comanche_appearance;
	result.locomotor_comanche_z_behavior = locomotor.comanche_z_behavior;
	result.locomotor_comanche_airborne_targeting_height =
		locomotor.comanche_airborne_targeting_height;
	result.locomotor_comanche_allow_airborne_motive_force =
		locomotor.comanche_allow_airborne_motive_force;
	result.locomotor_comanche_apply_2d_friction_when_airborne =
		locomotor.comanche_apply_2d_friction_when_airborne;
	result.locomotor_comanche_locomotor_works_when_dead =
		locomotor.comanche_locomotor_works_when_dead;
}

void copy_science_probe(const RealScienceIniProbeResult &science, ArchiveProbeResult &result)
{
	result.science_attempted = science.attempted;
	result.science_ok = science.ok;
	result.science_loaded_archives = science.loaded_archives;
	result.science_file_exists = science.file_exists;
	result.science_game_text_loaded = science.game_text_loaded;
	result.science_name_key_generator_loaded = science.name_key_generator_loaded;
	result.science_original_ini_load = science.original_ini_load;
	result.science_bytes = science.bytes;
	result.science_parsed_fields = science.parsed_fields;
	result.science_count = science.science_count;
	result.science_source = science.source;
	result.science_america_found = science.america_science_found;
	result.science_rank3_found = science.rank3_science_found;
	result.science_paladin_found = science.paladin_science_found;
	result.science_paladin_name_loaded = science.paladin_name_loaded;
	result.science_paladin_description_loaded = science.paladin_description_loaded;
	result.science_america_purchase_cost = science.america_purchase_cost;
	result.science_paladin_purchase_cost = science.paladin_purchase_cost;
	result.science_america_grantable = science.america_grantable;
	result.science_paladin_grantable = science.paladin_grantable;
}

void copy_special_power_probe(const RealSpecialPowerIniProbeResult &special_power, ArchiveProbeResult &result)
{
	result.special_power_attempted = special_power.attempted;
	result.special_power_ok = special_power.ok;
	result.special_power_loaded_archives = special_power.loaded_archives;
	result.special_power_file_exists = special_power.file_exists;
	result.special_power_science_file_exists = special_power.science_file_exists;
	result.special_power_game_text_loaded = special_power.game_text_loaded;
	result.special_power_name_key_generator_loaded = special_power.name_key_generator_loaded;
	result.special_power_audio_manager_loaded = special_power.audio_manager_loaded;
	result.special_power_science_original_ini_load = special_power.science_original_ini_load;
	result.special_power_original_ini_load = special_power.original_ini_load;
	result.special_power_bytes = special_power.bytes;
	result.special_power_science_bytes = special_power.science_bytes;
	result.special_power_parsed_fields = special_power.parsed_fields;
	result.special_power_count = special_power.special_power_count;
	result.special_power_source = special_power.source;
	result.special_power_daisy_cutter_found = special_power.daisy_cutter_found;
	result.special_power_carpet_bomb_found = special_power.carpet_bomb_found;
	result.special_power_crate_drop_found = special_power.crate_drop_found;
	result.special_power_neutron_missile_found = special_power.neutron_missile_found;
	result.special_power_scud_storm_found = special_power.scud_storm_found;
	result.special_power_daisy_cutter_enum = special_power.daisy_cutter_enum;
	result.special_power_carpet_bomb_enum = special_power.carpet_bomb_enum;
	result.special_power_crate_drop_enum = special_power.crate_drop_enum;
	result.special_power_daisy_cutter_reload_frames = special_power.daisy_cutter_reload_frames;
	result.special_power_carpet_bomb_reload_frames = special_power.carpet_bomb_reload_frames;
	result.special_power_crate_drop_reload_frames = special_power.crate_drop_reload_frames;
	result.special_power_daisy_cutter_required_science_valid =
		special_power.daisy_cutter_required_science_valid;
	result.special_power_crate_drop_required_science_valid =
		special_power.crate_drop_required_science_valid;
	result.special_power_daisy_cutter_public_timer = special_power.daisy_cutter_public_timer;
	result.special_power_carpet_bomb_public_timer = special_power.carpet_bomb_public_timer;
	result.special_power_crate_drop_public_timer = special_power.crate_drop_public_timer;
	result.special_power_daisy_cutter_shared_synced_timer =
		special_power.daisy_cutter_shared_synced_timer;
	result.special_power_carpet_bomb_shared_synced_timer =
		special_power.carpet_bomb_shared_synced_timer;
	result.special_power_crate_drop_shared_synced_timer =
		special_power.crate_drop_shared_synced_timer;
	result.special_power_daisy_cutter_view_object_duration_frames =
		special_power.daisy_cutter_view_object_duration_frames;
	result.special_power_carpet_bomb_view_object_duration_frames =
		special_power.carpet_bomb_view_object_duration_frames;
	result.special_power_crate_drop_view_object_duration_frames =
		special_power.crate_drop_view_object_duration_frames;
	result.special_power_daisy_cutter_view_object_range =
		special_power.daisy_cutter_view_object_range;
	result.special_power_carpet_bomb_view_object_range =
		special_power.carpet_bomb_view_object_range;
	result.special_power_crate_drop_view_object_range =
		special_power.crate_drop_view_object_range;
	result.special_power_daisy_cutter_radius_cursor_radius =
		special_power.daisy_cutter_radius_cursor_radius;
	result.special_power_carpet_bomb_radius_cursor_radius =
		special_power.carpet_bomb_radius_cursor_radius;
	result.special_power_crate_drop_radius_cursor_radius =
		special_power.crate_drop_radius_cursor_radius;
	result.special_power_daisy_cutter_shortcut_power = special_power.daisy_cutter_shortcut_power;
	result.special_power_carpet_bomb_shortcut_power = special_power.carpet_bomb_shortcut_power;
	result.special_power_crate_drop_shortcut_power = special_power.crate_drop_shortcut_power;
	result.special_power_daisy_cutter_academy_classification =
		special_power.daisy_cutter_academy_classification;
	result.special_power_carpet_bomb_academy_classification =
		special_power.carpet_bomb_academy_classification;
	result.special_power_daisy_cutter_required_science =
		special_power.daisy_cutter_required_science;
	result.special_power_crate_drop_required_science =
		special_power.crate_drop_required_science;
	result.special_power_neutron_missile_initiate_at_location_sound =
		special_power.neutron_missile_initiate_at_location_sound;
	result.special_power_scud_storm_initiate_sound =
		special_power.scud_storm_initiate_sound;
}

void copy_command_button_probe(const RealCommandButtonIniProbeResult &command_button, ArchiveProbeResult &result)
{
	result.command_button_attempted = command_button.attempted;
	result.command_button_ok = command_button.ok;
	result.command_button_loaded_archives = command_button.loaded_archives;
	result.command_button_file_exists = command_button.file_exists;
	result.command_button_science_file_exists = command_button.science_file_exists;
	result.command_button_special_power_file_exists = command_button.special_power_file_exists;
	result.command_button_upgrade_file_exists = command_button.upgrade_file_exists;
	result.command_button_name_key_generator_loaded =
		command_button.name_key_generator_loaded;
	result.command_button_science_original_ini_load =
		command_button.science_original_ini_load;
	result.command_button_special_power_original_ini_load =
		command_button.special_power_original_ini_load;
	result.command_button_upgrade_original_ini_load =
		command_button.upgrade_original_ini_load;
	result.command_button_original_ini_load = command_button.original_ini_load;
	result.command_button_filtered_from_shipped = command_button.filtered_from_shipped;
	result.command_button_special_power_option_pairing_valid =
		command_button.special_power_option_pairing_valid;
	result.command_button_bytes = command_button.bytes;
	result.command_button_science_bytes = command_button.science_bytes;
	result.command_button_special_power_bytes = command_button.special_power_bytes;
	result.command_button_upgrade_bytes = command_button.upgrade_bytes;
	result.command_button_filtered_bytes = command_button.filtered_bytes;
	result.command_button_filtered_blocks = command_button.filtered_blocks;
	result.command_button_parsed_fields = command_button.parsed_fields;
	result.command_button_count = command_button.button_count;
	result.command_button_source = command_button.source;
	result.command_button_flash_bang_upgrade_found =
		command_button.flash_bang_upgrade_found;
	result.command_button_flash_bang_upgrade_command =
		command_button.flash_bang_upgrade_command;
	result.command_button_flash_bang_upgrade_border =
		command_button.flash_bang_upgrade_border;
	result.command_button_flash_bang_upgrade_name =
		command_button.flash_bang_upgrade_name;
	result.command_button_flash_bang_upgrade_label =
		command_button.flash_bang_upgrade_label;
	result.command_button_flash_bang_upgrade_description =
		command_button.flash_bang_upgrade_description;
	result.command_button_ranger_capture_found = command_button.ranger_capture_found;
	result.command_button_ranger_capture_command = command_button.ranger_capture_command;
	result.command_button_ranger_capture_options = command_button.ranger_capture_options;
	result.command_button_ranger_capture_border = command_button.ranger_capture_border;
	result.command_button_ranger_capture_upgrade_name =
		command_button.ranger_capture_upgrade_name;
	result.command_button_ranger_capture_special_power_name =
		command_button.ranger_capture_special_power_name;
	result.command_button_ranger_capture_label = command_button.ranger_capture_label;
	result.command_button_ranger_capture_description =
		command_button.ranger_capture_description;
	result.command_button_ranger_capture_cursor = command_button.ranger_capture_cursor;
	result.command_button_ranger_capture_invalid_cursor =
		command_button.ranger_capture_invalid_cursor;
	result.command_button_ranger_capture_has_enemy_target =
		command_button.ranger_capture_has_enemy_target;
	result.command_button_ranger_capture_has_neutral_target =
		command_button.ranger_capture_has_neutral_target;
	result.command_button_ranger_capture_has_multi_select =
		command_button.ranger_capture_has_multi_select;
	result.command_button_ranger_capture_has_need_upgrade =
		command_button.ranger_capture_has_need_upgrade;
	result.command_button_ranger_capture_has_need_special_power_science =
		command_button.ranger_capture_has_need_special_power_science;
	result.command_button_flash_bang_switch_found =
		command_button.flash_bang_switch_found;
	result.command_button_flash_bang_switch_command =
		command_button.flash_bang_switch_command;
	result.command_button_flash_bang_switch_options =
		command_button.flash_bang_switch_options;
	result.command_button_flash_bang_switch_weapon_slot =
		command_button.flash_bang_switch_weapon_slot;
	result.command_button_flash_bang_switch_border =
		command_button.flash_bang_switch_border;
	result.command_button_flash_bang_switch_upgrade_name =
		command_button.flash_bang_switch_upgrade_name;
	result.command_button_flash_bang_switch_label =
		command_button.flash_bang_switch_label;
	result.command_button_flash_bang_switch_description =
		command_button.flash_bang_switch_description;
	result.command_button_flash_bang_switch_has_check_like =
		command_button.flash_bang_switch_has_check_like;
	result.command_button_flash_bang_switch_has_multi_select =
		command_button.flash_bang_switch_has_multi_select;
	result.command_button_flash_bang_switch_has_need_upgrade =
		command_button.flash_bang_switch_has_need_upgrade;
}

void copy_command_set_probe(const RealCommandSetIniProbeResult &command_set, ArchiveProbeResult &result)
{
	result.command_set_attempted = command_set.attempted;
	result.command_set_ok = command_set.ok;
	result.command_set_loaded_archives = command_set.loaded_archives;
	result.command_set_file_exists = command_set.file_exists;
	result.command_set_command_button_file_exists = command_set.command_button_file_exists;
	result.command_set_special_power_file_exists = command_set.special_power_file_exists;
	result.command_set_upgrade_file_exists = command_set.upgrade_file_exists;
	result.command_set_name_key_generator_loaded = command_set.name_key_generator_loaded;
	result.command_set_special_power_original_ini_load =
		command_set.special_power_original_ini_load;
	result.command_set_upgrade_original_ini_load = command_set.upgrade_original_ini_load;
	result.command_set_command_button_original_ini_load =
		command_set.command_button_original_ini_load;
	result.command_set_original_ini_load = command_set.original_ini_load;
	result.command_set_filtered_from_shipped = command_set.filtered_from_shipped;
	result.command_set_bytes = command_set.bytes;
	result.command_set_command_button_bytes = command_set.command_button_bytes;
	result.command_set_special_power_bytes = command_set.special_power_bytes;
	result.command_set_upgrade_bytes = command_set.upgrade_bytes;
	result.command_set_filtered_command_button_bytes =
		command_set.filtered_command_button_bytes;
	result.command_set_filtered_command_button_blocks =
		command_set.filtered_command_button_blocks;
	result.command_set_filtered_command_set_bytes = command_set.filtered_command_set_bytes;
	result.command_set_filtered_command_set_blocks = command_set.filtered_command_set_blocks;
	result.command_set_parsed_fields = command_set.parsed_fields;
	result.command_set_command_button_count = command_set.command_button_count;
	result.command_set_count = command_set.command_set_count;
	result.command_set_source = command_set.source;
	result.command_set_ranger_found = command_set.ranger_set_found;
	result.command_set_ranger_slot1 = command_set.ranger_slot1;
	result.command_set_ranger_slot2 = command_set.ranger_slot2;
	result.command_set_ranger_slot4 = command_set.ranger_slot4;
	result.command_set_ranger_slot11 = command_set.ranger_slot11;
	result.command_set_ranger_slot13 = command_set.ranger_slot13;
	result.command_set_ranger_slot14 = command_set.ranger_slot14;
	result.command_set_ranger_slot1_command = command_set.ranger_slot1_command;
	result.command_set_ranger_slot2_command = command_set.ranger_slot2_command;
	result.command_set_ranger_slot4_command = command_set.ranger_slot4_command;
	result.command_set_ranger_slot11_command = command_set.ranger_slot11_command;
	result.command_set_ranger_slot13_command = command_set.ranger_slot13_command;
	result.command_set_ranger_slot14_command = command_set.ranger_slot14_command;
	result.command_set_ranger_slot2_weapon_slot = command_set.ranger_slot2_weapon_slot;
	result.command_set_ranger_slot4_weapon_slot = command_set.ranger_slot4_weapon_slot;
	result.command_set_ranger_slot1_special_power = command_set.ranger_slot1_special_power;
	result.command_set_ranger_slot1_upgrade = command_set.ranger_slot1_upgrade;
	result.command_set_ranger_slot4_upgrade = command_set.ranger_slot4_upgrade;
}

void copy_control_bar_scheme_probe(
	const RealControlBarSchemeIniProbeResult &control_bar_scheme,
	ArchiveProbeResult &result)
{
	result.control_bar_scheme_attempted = control_bar_scheme.attempted;
	result.control_bar_scheme_ok = control_bar_scheme.ok;
	result.control_bar_scheme_loaded_archives = control_bar_scheme.loaded_archives;
	result.control_bar_scheme_default_file_exists = control_bar_scheme.default_file_exists;
	result.control_bar_scheme_file_exists = control_bar_scheme.file_exists;
	result.control_bar_scheme_name_key_generator_loaded =
		control_bar_scheme.name_key_generator_loaded;
	result.control_bar_scheme_mapped_images_loaded =
		control_bar_scheme.mapped_images_loaded;
	result.control_bar_scheme_control_bar_loaded = control_bar_scheme.control_bar_loaded;
	result.control_bar_scheme_original_default_ini_load =
		control_bar_scheme.original_default_ini_load;
	result.control_bar_scheme_original_ini_load = control_bar_scheme.original_ini_load;
	result.control_bar_scheme_default_bytes = control_bar_scheme.default_bytes;
	result.control_bar_scheme_bytes = control_bar_scheme.bytes;
	result.control_bar_scheme_mapped_image_count = control_bar_scheme.mapped_image_count;
	result.control_bar_scheme_parsed_fields = control_bar_scheme.parsed_fields;
	result.control_bar_scheme_source = control_bar_scheme.source;
	result.control_bar_scheme_default_found = control_bar_scheme.default_found;
	result.control_bar_scheme_default_queue_image = control_bar_scheme.default_queue_image;
	result.control_bar_scheme_default_right_hud_image =
		control_bar_scheme.default_right_hud_image;
	result.control_bar_scheme_default_base_image = control_bar_scheme.default_base_image;
	result.control_bar_scheme_default_base_layer = control_bar_scheme.default_base_layer;
	result.control_bar_scheme_default_base_width = control_bar_scheme.default_base_width;
	result.control_bar_scheme_default_base_height = control_bar_scheme.default_base_height;
	result.control_bar_scheme_america_found = control_bar_scheme.america_found;
	result.control_bar_scheme_america_side = control_bar_scheme.america_side;
	result.control_bar_scheme_america_queue_image = control_bar_scheme.america_queue_image;
	result.control_bar_scheme_america_right_hud_image =
		control_bar_scheme.america_right_hud_image;
	result.control_bar_scheme_america_command_marker_image =
		control_bar_scheme.america_command_marker_image;
	result.control_bar_scheme_america_power_purchase_image =
		control_bar_scheme.america_power_purchase_image;
	result.control_bar_scheme_america_base_image = control_bar_scheme.america_base_image;
	result.control_bar_scheme_america_screen_x = control_bar_scheme.america_screen_x;
	result.control_bar_scheme_america_screen_y = control_bar_scheme.america_screen_y;
	result.control_bar_scheme_america_base_layer = control_bar_scheme.america_base_layer;
	result.control_bar_scheme_america_base_x = control_bar_scheme.america_base_x;
	result.control_bar_scheme_america_base_y = control_bar_scheme.america_base_y;
	result.control_bar_scheme_america_base_width = control_bar_scheme.america_base_width;
	result.control_bar_scheme_america_base_height = control_bar_scheme.america_base_height;
	result.control_bar_scheme_gla_found = control_bar_scheme.gla_found;
	result.control_bar_scheme_gla_side = control_bar_scheme.gla_side;
	result.control_bar_scheme_gla_right_hud_image = control_bar_scheme.gla_right_hud_image;
	result.control_bar_scheme_gla_command_marker_image =
		control_bar_scheme.gla_command_marker_image;
	result.control_bar_scheme_gla_power_purchase_image =
		control_bar_scheme.gla_power_purchase_image;
	result.control_bar_scheme_gla_base_image = control_bar_scheme.gla_base_image;
	result.control_bar_scheme_china_found = control_bar_scheme.china_found;
	result.control_bar_scheme_china_side = control_bar_scheme.china_side;
	result.control_bar_scheme_china_right_hud_image =
		control_bar_scheme.china_right_hud_image;
	result.control_bar_scheme_china_command_marker_image =
		control_bar_scheme.china_command_marker_image;
	result.control_bar_scheme_china_power_purchase_image =
		control_bar_scheme.china_power_purchase_image;
	result.control_bar_scheme_china_gen_arrow_image =
		control_bar_scheme.china_gen_arrow_image;
	result.control_bar_scheme_china_base_image = control_bar_scheme.china_base_image;
}

void copy_crate_probe(const RealCrateIniProbeResult &crate, ArchiveProbeResult &result)
{
	result.crate_attempted = crate.attempted;
	result.crate_ok = crate.ok;
	result.crate_loaded_archives = crate.loaded_archives;
	result.crate_file_exists = crate.file_exists;
	result.crate_science_file_exists = crate.science_file_exists;
	result.crate_game_text_loaded = crate.game_text_loaded;
	result.crate_name_key_generator_loaded = crate.name_key_generator_loaded;
	result.crate_science_original_ini_load = crate.science_original_ini_load;
	result.crate_original_ini_load = crate.original_ini_load;
	result.crate_filtered_from_shipped = crate.filtered_from_shipped;
	result.crate_bytes = crate.bytes;
	result.crate_science_bytes = crate.science_bytes;
	result.crate_filtered_bytes = crate.filtered_bytes;
	result.crate_filtered_blocks = crate.filtered_blocks;
	result.crate_parsed_fields = crate.parsed_fields;
	result.crate_template_count = crate.crate_template_count;
	result.crate_source = crate.source;
	result.crate_salvage_found = crate.salvage_found;
	result.crate_salvage_creation_chance = crate.salvage_creation_chance;
	result.crate_salvage_salvager_kindof = crate.salvage_salvager_kindof;
	result.crate_salvage_killer_science_valid = crate.salvage_killer_science_valid;
	result.crate_salvage_object_count = crate.salvage_object_count;
	result.crate_salvage_object_name = crate.salvage_object_name;
	result.crate_salvage_object_chance = crate.salvage_object_chance;
	result.crate_elite_found = crate.elite_found;
	result.crate_elite_creation_chance = crate.elite_creation_chance;
	result.crate_elite_veterancy_level = crate.elite_veterancy_level;
	result.crate_elite_object_count = crate.elite_object_count;
	result.crate_elite_first_object = crate.elite_first_object;
	result.crate_elite_first_chance = crate.elite_first_chance;
	result.crate_elite_second_object = crate.elite_second_object;
	result.crate_elite_second_chance = crate.elite_second_chance;
	result.crate_heroic_found = crate.heroic_found;
	result.crate_heroic_creation_chance = crate.heroic_creation_chance;
	result.crate_heroic_veterancy_level = crate.heroic_veterancy_level;
	result.crate_heroic_object_count = crate.heroic_object_count;
	result.crate_heroic_first_object = crate.heroic_first_object;
	result.crate_heroic_first_chance = crate.heroic_first_chance;
	result.crate_heroic_third_object = crate.heroic_third_object;
	result.crate_heroic_third_chance = crate.heroic_third_chance;
	result.crate_gla02_100_found = crate.gla02_100_found;
	result.crate_gla02_100_owned_by_maker = crate.gla02_100_owned_by_maker;
	result.crate_gla02_100_object = crate.gla02_100_object;
	result.crate_gla02_100_object_chance = crate.gla02_100_object_chance;
	result.crate_gla02_2500_found = crate.gla02_2500_found;
	result.crate_gla02_2500_owned_by_maker = crate.gla02_2500_owned_by_maker;
	result.crate_gla02_2500_object = crate.gla02_2500_object;
	result.crate_gla02_2500_object_chance = crate.gla02_2500_object_chance;
}

void copy_draw_group_info_probe(
	const RealDrawGroupInfoIniProbeResult &draw_group_info,
	ArchiveProbeResult &result)
{
	result.draw_group_info_attempted = draw_group_info.attempted;
	result.draw_group_info_ok = draw_group_info.ok;
	result.draw_group_info_loaded_archives = draw_group_info.loaded_archives;
	result.draw_group_info_file_exists = draw_group_info.file_exists;
	result.draw_group_info_original_ini_load = draw_group_info.original_ini_load;
	result.draw_group_info_bytes = draw_group_info.bytes;
	result.draw_group_info_parsed_fields = draw_group_info.parsed_fields;
	result.draw_group_info_source = draw_group_info.source;
	result.draw_group_info_font_name = draw_group_info.font_name;
	result.draw_group_info_font_size = draw_group_info.font_size;
	result.draw_group_info_font_is_bold = draw_group_info.font_is_bold;
	result.draw_group_info_use_player_color = draw_group_info.use_player_color;
	result.draw_group_info_color_for_text = draw_group_info.color_for_text;
	result.draw_group_info_color_for_text_drop_shadow =
		draw_group_info.color_for_text_drop_shadow;
	result.draw_group_info_drop_shadow_offset_x = draw_group_info.drop_shadow_offset_x;
	result.draw_group_info_drop_shadow_offset_y = draw_group_info.drop_shadow_offset_y;
	result.draw_group_info_using_pixel_offset_x = draw_group_info.using_pixel_offset_x;
	result.draw_group_info_using_pixel_offset_y = draw_group_info.using_pixel_offset_y;
	result.draw_group_info_pixel_offset_x = draw_group_info.pixel_offset_x;
	result.draw_group_info_pixel_offset_y = draw_group_info.pixel_offset_y;
	result.draw_group_info_percent_offset_x = draw_group_info.percent_offset_x;
	result.draw_group_info_percent_offset_y = draw_group_info.percent_offset_y;
}

void copy_player_template_probe(const RealPlayerTemplateIniProbeResult &player_template, ArchiveProbeResult &result)
{
	result.player_template_attempted = player_template.attempted;
	result.player_template_ok = player_template.ok;
	result.player_template_loaded_archives = player_template.loaded_archives;
	result.player_template_file_exists = player_template.file_exists;
	result.player_template_science_file_exists = player_template.science_file_exists;
	result.player_template_game_text_loaded = player_template.game_text_loaded;
	result.player_template_name_key_generator_loaded =
		player_template.name_key_generator_loaded;
	result.player_template_science_original_ini_load =
		player_template.science_original_ini_load;
	result.player_template_original_ini_load = player_template.original_ini_load;
	result.player_template_bytes = player_template.bytes;
	result.player_template_science_bytes = player_template.science_bytes;
	result.player_template_parsed_fields = player_template.parsed_fields;
	result.player_template_count = player_template.player_template_count;
	result.player_template_side_count = player_template.side_count;
	result.player_template_source = player_template.source;
	result.player_template_america_found = player_template.america_found;
	result.player_template_china_found = player_template.china_found;
	result.player_template_gla_found = player_template.gla_found;
	result.player_template_observer_found = player_template.observer_found;
	result.player_template_air_force_found = player_template.air_force_found;
	result.player_template_boss_found = player_template.boss_found;
	result.player_template_america_display_name_loaded =
		player_template.america_display_name_loaded;
	result.player_template_america_side = player_template.america_side;
	result.player_template_america_base_side = player_template.america_base_side;
	result.player_template_america_playable = player_template.america_playable;
	result.player_template_america_old_faction = player_template.america_old_faction;
	result.player_template_america_start_money = player_template.america_start_money;
	result.player_template_america_intrinsic_science_count =
		player_template.america_intrinsic_science_count;
	result.player_template_america_intrinsic_science_valid =
		player_template.america_intrinsic_science_valid;
	result.player_template_america_starting_building =
		player_template.america_starting_building;
	result.player_template_america_starting_unit0 = player_template.america_starting_unit0;
	result.player_template_america_shortcut_command_set =
		player_template.america_shortcut_command_set;
	result.player_template_america_shortcut_win_name =
		player_template.america_shortcut_win_name;
	result.player_template_america_shortcut_button_count =
		player_template.america_shortcut_button_count;
	result.player_template_america_load_screen = player_template.america_load_screen;
	result.player_template_america_score_screen = player_template.america_score_screen;
	result.player_template_america_load_music = player_template.america_load_music;
	result.player_template_america_score_music = player_template.america_score_music;
	result.player_template_america_beacon = player_template.america_beacon;
	result.player_template_observer_is_observer = player_template.observer_is_observer;
	result.player_template_observer_playable = player_template.observer_playable;
	result.player_template_observer_side = player_template.observer_side;
	result.player_template_observer_load_screen = player_template.observer_load_screen;
	result.player_template_observer_beacon = player_template.observer_beacon;
	result.player_template_air_force_side = player_template.air_force_side;
	result.player_template_air_force_base_side = player_template.air_force_base_side;
	result.player_template_air_force_playable = player_template.air_force_playable;
	result.player_template_air_force_old_faction = player_template.air_force_old_faction;
	result.player_template_air_force_starting_building =
		player_template.air_force_starting_building;
	result.player_template_air_force_starting_unit0 =
		player_template.air_force_starting_unit0;
	result.player_template_air_force_shortcut_command_set =
		player_template.air_force_shortcut_command_set;
	result.player_template_air_force_shortcut_button_count =
		player_template.air_force_shortcut_button_count;
	result.player_template_boss_side = player_template.boss_side;
	result.player_template_boss_base_side = player_template.boss_base_side;
	result.player_template_boss_playable = player_template.boss_playable;
	result.player_template_boss_old_faction = player_template.boss_old_faction;
	result.player_template_boss_intrinsic_science_count =
		player_template.boss_intrinsic_science_count;
	result.player_template_boss_intrinsic_sciences_valid =
		player_template.boss_intrinsic_sciences_valid;
	result.player_template_boss_starting_building = player_template.boss_starting_building;
	result.player_template_boss_starting_unit0 = player_template.boss_starting_unit0;
	result.player_template_boss_shortcut_command_set =
		player_template.boss_shortcut_command_set;
	result.player_template_boss_shortcut_win_name = player_template.boss_shortcut_win_name;
	result.player_template_boss_shortcut_button_count =
		player_template.boss_shortcut_button_count;
}

void copy_game_data_probe(const RealGameDataIniProbeResult &game_data, ArchiveProbeResult &result)
{
	result.game_data_attempted = game_data.attempted;
	result.game_data_ok = game_data.ok;
	result.game_data_loaded_archives = game_data.loaded_archives;
	result.game_data_file_exists = game_data.file_exists;
	result.game_data_original_ini_load = game_data.original_ini_load;
	result.game_data_bytes = game_data.bytes;
	result.game_data_parsed_fields = game_data.parsed_fields;
	result.game_data_source = game_data.source;
	result.game_data_shell_map_name = game_data.shell_map_name;
	result.game_data_use_fps_limit = game_data.use_fps_limit;
	result.game_data_frames_per_second_limit = game_data.frames_per_second_limit;
	result.game_data_max_shell_screens = game_data.max_shell_screens;
	result.game_data_use_cloud_map = game_data.use_cloud_map;
	result.game_data_default_structure_rubble_height = game_data.default_structure_rubble_height;
	result.game_data_group_select_volume_base = game_data.group_select_volume_base;
	result.game_data_max_particle_count = game_data.max_particle_count;
}

void copy_multiplayer_probe(const RealMultiplayerIniProbeResult &multiplayer, ArchiveProbeResult &result)
{
	result.multiplayer_attempted = multiplayer.attempted;
	result.multiplayer_ok = multiplayer.ok;
	result.multiplayer_loaded_archives = multiplayer.loaded_archives;
	result.multiplayer_file_exists = multiplayer.file_exists;
	result.multiplayer_original_ini_load = multiplayer.original_ini_load;
	result.multiplayer_bytes = multiplayer.bytes;
	result.multiplayer_parsed_fields = multiplayer.parsed_fields;
	result.multiplayer_color_count = multiplayer.color_count;
	result.multiplayer_starting_money_count = multiplayer.starting_money_count;
	result.multiplayer_source = multiplayer.source;
	result.multiplayer_start_countdown_seconds = multiplayer.start_countdown_seconds;
	result.multiplayer_max_beacons_per_player = multiplayer.max_beacons_per_player;
	result.multiplayer_use_shroud = multiplayer.use_shroud;
	result.multiplayer_show_random_player_template = multiplayer.show_random_player_template;
	result.multiplayer_show_random_start_pos = multiplayer.show_random_start_pos;
	result.multiplayer_show_random_color = multiplayer.show_random_color;
	result.multiplayer_gold_color_found = multiplayer.gold_color_found;
	result.multiplayer_purple_color_found = multiplayer.purple_color_found;
	result.multiplayer_gold_color = multiplayer.gold_color;
	result.multiplayer_purple_night_color = multiplayer.purple_night_color;
	result.multiplayer_chat_default_color = multiplayer.chat_default_color;
	result.multiplayer_chat_game_color = multiplayer.chat_game_color;
	result.multiplayer_chat_player_normal_color = multiplayer.chat_player_normal_color;
	result.multiplayer_chat_self_color = multiplayer.chat_self_color;
	result.multiplayer_chat_map_selected_color = multiplayer.chat_map_selected_color;
	result.multiplayer_starting_money_first = multiplayer.starting_money_first;
	result.multiplayer_starting_money_second = multiplayer.starting_money_second;
	result.multiplayer_starting_money_third = multiplayer.starting_money_third;
	result.multiplayer_starting_money_fourth = multiplayer.starting_money_fourth;
	result.multiplayer_default_starting_money = multiplayer.default_starting_money;
}

void copy_terrain_probe(const RealTerrainIniProbeResult &terrain, ArchiveProbeResult &result)
{
	result.terrain_attempted = terrain.attempted;
	result.terrain_ok = terrain.ok;
	result.terrain_loaded_archives = terrain.loaded_archives;
	result.terrain_file_exists = terrain.file_exists;
	result.terrain_original_ini_load = terrain.original_ini_load;
	result.terrain_bytes = terrain.bytes;
	result.terrain_parsed_fields = terrain.parsed_fields;
	result.terrain_count = terrain.terrain_count;
	result.terrain_source = terrain.source;
	result.terrain_transition_found = terrain.transition_found;
	result.terrain_asphalt_found = terrain.asphalt_found;
	result.terrain_desert_dry_found = terrain.desert_dry_found;
	result.terrain_beach_tropical_found = terrain.beach_tropical_found;
	result.terrain_snow_flat_found = terrain.snow_flat_found;
	result.terrain_transition_texture = terrain.transition_texture;
	result.terrain_asphalt_texture = terrain.asphalt_texture;
	result.terrain_desert_dry_texture = terrain.desert_dry_texture;
	result.terrain_beach_tropical_texture = terrain.beach_tropical_texture;
	result.terrain_snow_flat_texture = terrain.snow_flat_texture;
	result.terrain_transition_class = terrain.transition_class;
	result.terrain_asphalt_class = terrain.asphalt_class;
	result.terrain_desert_dry_class = terrain.desert_dry_class;
	result.terrain_beach_tropical_class = terrain.beach_tropical_class;
	result.terrain_snow_flat_class = terrain.snow_flat_class;
	result.terrain_asphalt_blend_edges = terrain.asphalt_blend_edges;
	result.terrain_asphalt_restrict_construction = terrain.asphalt_restrict_construction;
}

void copy_terrain_roads_probe(const RealTerrainRoadsIniProbeResult &terrain_roads, ArchiveProbeResult &result)
{
	result.terrain_roads_attempted = terrain_roads.attempted;
	result.terrain_roads_ok = terrain_roads.ok;
	result.terrain_roads_loaded_archives = terrain_roads.loaded_archives;
	result.terrain_roads_file_exists = terrain_roads.file_exists;
	result.terrain_roads_original_ini_load = terrain_roads.original_ini_load;
	result.terrain_roads_bytes = terrain_roads.bytes;
	result.terrain_roads_parsed_fields = terrain_roads.parsed_fields;
	result.terrain_roads_road_count = terrain_roads.road_count;
	result.terrain_roads_bridge_count = terrain_roads.bridge_count;
	result.terrain_roads_source = terrain_roads.source;
	result.terrain_roads_two_lane_found = terrain_roads.two_lane_found;
	result.terrain_roads_four_lane_found = terrain_roads.four_lane_found;
	result.terrain_roads_dirt_road_found = terrain_roads.dirt_road_found;
	result.terrain_roads_concrete_bridge_found = terrain_roads.concrete_bridge_found;
	result.terrain_roads_two_lane_texture = terrain_roads.two_lane_texture;
	result.terrain_roads_four_lane_texture = terrain_roads.four_lane_texture;
	result.terrain_roads_dirt_road_texture = terrain_roads.dirt_road_texture;
	result.terrain_roads_concrete_bridge_texture = terrain_roads.concrete_bridge_texture;
	result.terrain_roads_concrete_bridge_model = terrain_roads.concrete_bridge_model;
	result.terrain_roads_concrete_bridge_damaged_texture =
		terrain_roads.concrete_bridge_damaged_texture;
	result.terrain_roads_concrete_bridge_scaffold = terrain_roads.concrete_bridge_scaffold;
	result.terrain_roads_concrete_bridge_tower_left = terrain_roads.concrete_bridge_tower_left;
	result.terrain_roads_concrete_bridge_damage_sound =
		terrain_roads.concrete_bridge_damage_sound;
	result.terrain_roads_concrete_bridge_repaired_sound =
		terrain_roads.concrete_bridge_repaired_sound;
	result.terrain_roads_concrete_bridge_damage_ocl = terrain_roads.concrete_bridge_damage_ocl;
	result.terrain_roads_concrete_bridge_damage_fx = terrain_roads.concrete_bridge_damage_fx;
	result.terrain_roads_concrete_bridge_repair_fx = terrain_roads.concrete_bridge_repair_fx;
	result.terrain_roads_two_lane_width = terrain_roads.two_lane_width;
	result.terrain_roads_two_lane_width_in_texture = terrain_roads.two_lane_width_in_texture;
	result.terrain_roads_four_lane_width = terrain_roads.four_lane_width;
	result.terrain_roads_dirt_road_width = terrain_roads.dirt_road_width;
	result.terrain_roads_dirt_road_width_in_texture = terrain_roads.dirt_road_width_in_texture;
	result.terrain_roads_concrete_bridge_scale = terrain_roads.concrete_bridge_scale;
	result.terrain_roads_concrete_bridge_radar_red = terrain_roads.concrete_bridge_radar_red;
	result.terrain_roads_concrete_bridge_radar_green = terrain_roads.concrete_bridge_radar_green;
	result.terrain_roads_concrete_bridge_radar_blue = terrain_roads.concrete_bridge_radar_blue;
	result.terrain_roads_concrete_bridge_transition_effects_height =
		terrain_roads.concrete_bridge_transition_effects_height;
	result.terrain_roads_concrete_bridge_num_fx_per_type =
		terrain_roads.concrete_bridge_num_fx_per_type;
}

void copy_upgrade_probe(const RealUpgradeIniProbeResult &upgrade, ArchiveProbeResult &result)
{
	result.upgrade_attempted = upgrade.attempted;
	result.upgrade_ok = upgrade.ok;
	result.upgrade_loaded_archives = upgrade.loaded_archives;
	result.upgrade_file_exists = upgrade.file_exists;
	result.upgrade_name_key_generator_loaded = upgrade.name_key_generator_loaded;
	result.upgrade_original_ini_load = upgrade.original_ini_load;
	result.upgrade_bytes = upgrade.bytes;
	result.upgrade_parsed_fields = upgrade.parsed_fields;
	result.upgrade_count = upgrade.upgrade_count;
	result.upgrade_source = upgrade.source;
	result.upgrade_veteran_found = upgrade.veteran_found;
	result.upgrade_elite_found = upgrade.elite_found;
	result.upgrade_heroic_found = upgrade.heroic_found;
	result.upgrade_flash_bang_found = upgrade.flash_bang_found;
	result.upgrade_capture_building_found = upgrade.capture_building_found;
	result.upgrade_laser_missiles_found = upgrade.laser_missiles_found;
	result.upgrade_china_mines_found = upgrade.china_mines_found;
	result.upgrade_america_radar_found = upgrade.america_radar_found;
	result.upgrade_flash_bang_display_name = upgrade.flash_bang_display_name;
	result.upgrade_capture_building_display_name = upgrade.capture_building_display_name;
	result.upgrade_laser_missiles_display_name = upgrade.laser_missiles_display_name;
	result.upgrade_china_mines_display_name = upgrade.china_mines_display_name;
	result.upgrade_america_radar_display_name = upgrade.america_radar_display_name;
	result.upgrade_flash_bang_research_sound = upgrade.flash_bang_research_sound;
	result.upgrade_laser_missiles_research_sound = upgrade.laser_missiles_research_sound;
	result.upgrade_china_mines_research_sound = upgrade.china_mines_research_sound;
	result.upgrade_america_radar_research_sound = upgrade.america_radar_research_sound;
	result.upgrade_flash_bang_type = upgrade.flash_bang_type;
	result.upgrade_capture_building_type = upgrade.capture_building_type;
	result.upgrade_laser_missiles_type = upgrade.laser_missiles_type;
	result.upgrade_china_mines_type = upgrade.china_mines_type;
	result.upgrade_america_radar_type = upgrade.america_radar_type;
	result.upgrade_flash_bang_build_frames = upgrade.flash_bang_build_frames;
	result.upgrade_capture_building_build_frames = upgrade.capture_building_build_frames;
	result.upgrade_laser_missiles_build_frames = upgrade.laser_missiles_build_frames;
	result.upgrade_china_mines_build_frames = upgrade.china_mines_build_frames;
	result.upgrade_america_radar_build_frames = upgrade.america_radar_build_frames;
	result.upgrade_flash_bang_cost = upgrade.flash_bang_cost;
	result.upgrade_capture_building_cost = upgrade.capture_building_cost;
	result.upgrade_laser_missiles_cost = upgrade.laser_missiles_cost;
	result.upgrade_china_mines_cost = upgrade.china_mines_cost;
	result.upgrade_america_radar_cost = upgrade.america_radar_cost;
	result.upgrade_america_radar_academy_classification =
		upgrade.america_radar_academy_classification;
}

void copy_water_probe(const RealWaterIniProbeResult &water, ArchiveProbeResult &result)
{
	result.water_attempted = water.attempted;
	result.water_ok = water.ok;
	result.water_loaded_archives = water.loaded_archives;
	result.water_file_exists = water.file_exists;
	result.water_original_ini_load = water.original_ini_load;
	result.water_transparency_loaded = water.transparency_loaded;
	result.water_bytes = water.bytes;
	result.water_parsed_fields = water.parsed_fields;
	result.water_set_count = water.water_set_count;
	result.water_source = water.source;
	result.water_morning_sky_texture = water.morning_sky_texture;
	result.water_morning_water_texture = water.morning_water_texture;
	result.water_night_sky_texture = water.night_sky_texture;
	result.water_night_water_texture = water.night_water_texture;
	result.water_standing_water_texture = water.standing_water_texture;
	result.water_morning_repeat_count = water.morning_water_repeat_count;
	result.water_night_repeat_count = water.night_water_repeat_count;
	result.water_morning_sky_texels_per_unit = water.morning_sky_texels_per_unit;
	result.water_night_sky_texels_per_unit = water.night_sky_texels_per_unit;
	result.water_morning_u_scroll_per_ms = water.morning_u_scroll_per_ms;
	result.water_morning_v_scroll_per_ms = water.morning_v_scroll_per_ms;
	result.water_night_u_scroll_per_ms = water.night_u_scroll_per_ms;
	result.water_night_v_scroll_per_ms = water.night_v_scroll_per_ms;
	result.water_transparent_depth = water.transparent_water_depth;
	result.water_transparent_min_opacity = water.transparent_water_min_opacity;
	result.water_additive_blending = water.additive_blending;
}

void copy_weather_probe(const RealWeatherIniProbeResult &weather, ArchiveProbeResult &result)
{
	result.weather_attempted = weather.attempted;
	result.weather_ok = weather.ok;
	result.weather_loaded_archives = weather.loaded_archives;
	result.weather_file_exists = weather.file_exists;
	result.weather_original_ini_load = weather.original_ini_load;
	result.weather_bytes = weather.bytes;
	result.weather_parsed_fields = weather.parsed_fields;
	result.weather_source = weather.source;
	result.weather_snow_texture = weather.snow_texture;
	result.weather_snow_enabled = weather.snow_enabled;
	result.weather_use_point_sprites = weather.use_point_sprites;
	result.weather_snow_box_dimensions = weather.snow_box_dimensions;
	result.weather_snow_box_density = weather.snow_box_density;
	result.weather_snow_frequency_scale_x = weather.snow_frequency_scale_x;
	result.weather_snow_frequency_scale_y = weather.snow_frequency_scale_y;
	result.weather_snow_amplitude = weather.snow_amplitude;
	result.weather_snow_velocity = weather.snow_velocity;
	result.weather_snow_point_size = weather.snow_point_size;
	result.weather_snow_quad_size = weather.snow_quad_size;
	result.weather_snow_max_point_size = weather.snow_max_point_size;
	result.weather_snow_min_point_size = weather.snow_min_point_size;
}

void copy_video_probe(const RealVideoIniProbeResult &video, ArchiveProbeResult &result)
{
	result.video_attempted = video.attempted;
	result.video_ok = video.ok;
	result.video_loaded_archives = video.loaded_archives;
	result.video_file_exists = video.file_exists;
	result.video_default_file_exists = video.default_file_exists;
	result.video_original_ini_load = video.original_ini_load;
	result.video_default_original_ini_load = video.default_original_ini_load;
	result.video_shipped_original_ini_load = video.shipped_original_ini_load;
	result.video_bytes = video.bytes;
	result.video_default_bytes = video.default_bytes;
	result.video_parsed_fields = video.parsed_fields;
	result.video_count = video.video_count;
	result.video_source = video.source;
	result.video_first_internal_name = video.first_internal_name;
	result.video_first_filename = video.first_filename;
	result.video_sample_internal_name = video.sample_internal_name;
	result.video_sample_filename = video.sample_filename;
}

void copy_map_cache_probe(const RealMapCacheIniProbeResult &map_cache, ArchiveProbeResult &result)
{
	result.map_cache_attempted = map_cache.attempted;
	result.map_cache_ok = map_cache.ok;
	result.map_cache_loaded_archives = map_cache.loaded_archives;
	result.map_cache_file_exists = map_cache.file_exists;
	result.map_cache_game_text_loaded = map_cache.game_text_loaded;
	result.map_cache_name_key_generator_loaded = map_cache.name_key_generator_loaded;
	result.map_cache_original_ini_load = map_cache.original_ini_load;
	result.map_cache_bytes = map_cache.bytes;
	result.map_cache_maps = map_cache.map_count;
	result.map_cache_multiplayer_maps = map_cache.multiplayer_count;
	result.map_cache_official_maps = map_cache.official_count;
	result.map_cache_source = map_cache.source;
	result.map_cache_has_shell_map_md = map_cache.has_shell_map_md;
	result.map_cache_has_tournament_desert = map_cache.has_tournament_desert;
	result.map_cache_shell_map_md_display_name = map_cache.shell_map_md_display_name;
	result.map_cache_tournament_desert_display_name = map_cache.tournament_desert_display_name;
	result.map_cache_shell_map_md_players = map_cache.shell_map_md_players;
	result.map_cache_tournament_desert_players = map_cache.tournament_desert_players;
}

void copy_mapped_image_probe(const RealMappedImageIniProbeResult &mapped_image, ArchiveProbeResult &result)
{
	result.mapped_image_attempted = mapped_image.attempted;
	result.mapped_image_ok = mapped_image.ok;
	result.mapped_image_loaded_archives = mapped_image.loaded_archives;
	result.mapped_image_file_exists = mapped_image.file_exists;
	result.mapped_image_name_key_generator_loaded = mapped_image.name_key_generator_loaded;
	result.mapped_image_original_ini_load = mapped_image.original_ini_load;
	result.mapped_image_bytes = mapped_image.bytes;
	result.mapped_image_parsed_fields = mapped_image.parsed_fields;
	result.mapped_image_file_count = mapped_image.file_count;
	result.mapped_image_count = mapped_image.image_count;
	result.mapped_image_source = mapped_image.source;
	result.mapped_image_sa_chinook_found = mapped_image.sa_chinook_found;
	result.mapped_image_sa_chinook_texture = mapped_image.sa_chinook_texture;
	result.mapped_image_sa_chinook_texture_width = mapped_image.sa_chinook_texture_width;
	result.mapped_image_sa_chinook_texture_height = mapped_image.sa_chinook_texture_height;
	result.mapped_image_sa_chinook_width = mapped_image.sa_chinook_width;
	result.mapped_image_sa_chinook_height = mapped_image.sa_chinook_height;
	result.mapped_image_sa_chinook_status = mapped_image.sa_chinook_status;
	result.mapped_image_sa_chinook_uv_lo_x = mapped_image.sa_chinook_uv_lo_x;
	result.mapped_image_sa_chinook_uv_lo_y = mapped_image.sa_chinook_uv_lo_y;
	result.mapped_image_sa_chinook_uv_hi_x = mapped_image.sa_chinook_uv_hi_x;
	result.mapped_image_sa_chinook_uv_hi_y = mapped_image.sa_chinook_uv_hi_y;
	result.mapped_image_watermark_china_found = mapped_image.watermark_china_found;
	result.mapped_image_watermark_china_texture = mapped_image.watermark_china_texture;
	result.mapped_image_watermark_china_width = mapped_image.watermark_china_width;
	result.mapped_image_watermark_china_height = mapped_image.watermark_china_height;
	result.mapped_image_watermark_china_status = mapped_image.watermark_china_status;
	result.mapped_image_watermark_china_rotated = mapped_image.watermark_china_rotated;
}

void probe_original_game_text(ArchiveProbeResult &result)
{
	result.game_text_attempted = true;
	GameTextInterface *old_game_text = TheGameText;
	GameTextInterface *game_text = CreateGameTextInterface();
	TheGameText = game_text;

	try {
		if (game_text != nullptr) {
			game_text->init();

			Bool title_exists = FALSE;
			const UnicodeString title = game_text->fetch("GUI:Command&ConquerGenerals", &title_exists);
			result.game_text_title_label = title_exists && !title.isEmpty();

			Bool control_bar_exists = FALSE;
			const UnicodeString control_bar_text =
				game_text->fetch("CONTROLBAR:ConstructAmericaCommandCenter", &control_bar_exists);
			result.game_text_control_bar_label = control_bar_exists && !control_bar_text.isEmpty();

			AsciiStringVec &control_bar_labels =
				game_text->getStringsWithLabelPrefix(AsciiString("CONTROLBAR:"));
			result.game_text_control_bar_label_count = control_bar_labels.size();
			result.game_text_ok =
				result.game_text_title_label &&
				result.game_text_control_bar_label &&
				result.game_text_control_bar_label_count > 20;
		}
	} catch (...) {
		result.game_text_ok = false;
	}

	TheGameText = old_game_text;
	delete game_text;
}
}

ArchiveProbeResult probe_original_archive(const char *archive_path)
{
	ArchiveProbeResult result;
	result.attempted = true;
	result.archive_path = archive_path != nullptr ? archive_path : "";

	AsciiString archive_directory;
	AsciiString archive_mask;
	split_archive_path(archive_path, archive_directory, archive_mask);
	if (archive_mask.isEmpty()) {
		return result;
	}

	initMemoryManager();

	{
		Win32LocalFileSystem local_file_system;
		FileSystem file_system;
		Win32BIGFileSystem archive_file_system;

		TheLocalFileSystem = &local_file_system;
		TheArchiveFileSystem = &archive_file_system;
		TheFileSystem = &file_system;

			result.loaded = archive_file_system.loadBigFilesFromDirectory(archive_directory, archive_mask);
		if (result.loaded) {
			result.has_armor_ini = archive_file_system.doesFileExist(ARMOR_INI_PATH);
			result.has_damage_fx_ini = archive_file_system.doesFileExist(DAMAGE_FX_INI_PATH);
			result.has_default_ai_data_ini =
				archive_file_system.doesFileExist(DEFAULT_AI_DATA_INI_PATH);
			result.has_ai_data_ini = archive_file_system.doesFileExist(AI_DATA_INI_PATH);
			result.has_locomotor_ini = archive_file_system.doesFileExist(LOCOMOTOR_INI_PATH);
			result.has_command_button_ini = archive_file_system.doesFileExist(COMMAND_BUTTON_INI_PATH);
			result.has_command_set_ini = archive_file_system.doesFileExist(COMMAND_SET_INI_PATH);
			result.has_control_bar_scheme_ini =
				archive_file_system.doesFileExist(CONTROL_BAR_SCHEME_INI_PATH);
			result.has_default_control_bar_scheme_ini =
				archive_file_system.doesFileExist(DEFAULT_CONTROL_BAR_SCHEME_INI_PATH);
			result.has_crate_ini = archive_file_system.doesFileExist(CRATE_INI_PATH);
			result.has_player_template_ini = archive_file_system.doesFileExist(PLAYER_TEMPLATE_INI_PATH);
			result.has_game_data_ini = archive_file_system.doesFileExist(GAME_DATA_INI_PATH);
			result.has_multiplayer_ini = archive_file_system.doesFileExist(MULTIPLAYER_INI_PATH);
			result.has_science_ini = archive_file_system.doesFileExist(SCIENCE_INI_PATH);
			result.has_special_power_ini = archive_file_system.doesFileExist(SPECIAL_POWER_INI_PATH);
			result.has_terrain_ini = archive_file_system.doesFileExist(TERRAIN_INI_PATH);
			result.has_roads_ini = archive_file_system.doesFileExist(ROADS_INI_PATH);
			result.has_draw_group_info_ini = archive_file_system.doesFileExist(DRAW_GROUP_INFO_INI_PATH);
			result.has_upgrade_ini = archive_file_system.doesFileExist(UPGRADE_INI_PATH);
			result.has_weapon_ini = archive_file_system.doesFileExist(WEAPON_INI_PATH);
			result.has_particle_system_ini =
				archive_file_system.doesFileExist(PARTICLE_SYSTEM_INI_PATH);
			result.has_map_cache_ini = archive_file_system.doesFileExist(MAP_CACHE_INI_PATH);
			result.has_default_video_ini = archive_file_system.doesFileExist(DEFAULT_VIDEO_INI_PATH);
			result.has_video_ini = archive_file_system.doesFileExist(VIDEO_INI_PATH);
			result.has_water_ini = archive_file_system.doesFileExist(WATER_INI_PATH);
			result.has_weather_ini = archive_file_system.doesFileExist(WEATHER_INI_PATH);
			result.has_generals_csf = archive_file_system.doesFileExist("Data\\English\\Generals.csf");

			std::vector<char> sample_data;
			const bool sample_ok = read_first_indexed_archive_file(
				archive_file_system,
				file_system,
				sample_data,
				result.indexed_file_count);
			result.sample_bytes = sample_data.size();
			result.ok =
				sample_ok &&
				result.indexed_file_count > 0;
			if (result.has_generals_csf) {
				probe_original_game_text(result);
			}
		}

		TheFileSystem = nullptr;
		TheArchiveFileSystem = nullptr;
		TheLocalFileSystem = nullptr;
	}

	shutdownMemoryManager();

	if (result.loaded && result.has_game_data_ini) {
		copy_game_data_probe(probe_original_game_data_ini_load(archive_path), result);
		result.ok = result.ok && result.game_data_ok;
	}
	if (result.loaded && result.has_armor_ini) {
		copy_armor_probe(probe_original_armor_ini_load(archive_path), result);
		result.ok = result.ok && result.armor_ok;
	}
	if (result.loaded && result.has_damage_fx_ini) {
		copy_damage_fx_probe(probe_original_damage_fx_ini_load(archive_path), result);
		result.ok = result.ok && result.damage_fx_ok;
	}
	if (result.loaded && result.has_weapon_ini && result.has_particle_system_ini) {
		copy_weapon_probe(probe_original_weapon_ini_load(archive_path), result);
		result.ok = result.ok && result.weapon_ok;
	}
	if (result.loaded && result.has_default_ai_data_ini && result.has_science_ini) {
		copy_ai_data_probe(probe_original_ai_data_ini_load(archive_path), result);
		result.ok = result.ok && result.ai_data_ok;
	}
	if (result.loaded && result.has_locomotor_ini) {
		copy_locomotor_probe(probe_original_locomotor_ini_load(archive_path), result);
		result.ok = result.ok && result.locomotor_ok;
	}
	if (result.loaded && result.has_science_ini && result.has_generals_csf) {
		copy_science_probe(probe_original_science_ini_load(archive_path), result);
		result.ok = result.ok && result.science_ok;
	}
	if (result.loaded && result.has_special_power_ini && result.has_science_ini && result.has_generals_csf) {
		copy_special_power_probe(probe_original_special_power_ini_load(archive_path), result);
		result.ok = result.ok && result.special_power_ok;
	}
	if (result.loaded && result.has_player_template_ini && result.has_science_ini && result.has_generals_csf) {
		copy_player_template_probe(probe_original_player_template_ini_load(archive_path), result);
		result.ok = result.ok && result.player_template_ok;
	}
	if (result.loaded && result.has_multiplayer_ini) {
		copy_multiplayer_probe(probe_original_multiplayer_ini_load(archive_path), result);
		result.ok = result.ok && result.multiplayer_ok;
	}
	if (result.loaded && result.has_terrain_ini) {
		copy_terrain_probe(probe_original_terrain_ini_load(archive_path), result);
		result.ok = result.ok && result.terrain_ok;
	}
	if (result.loaded && result.has_roads_ini) {
		copy_terrain_roads_probe(probe_original_terrain_roads_ini_load(archive_path), result);
		result.ok = result.ok && result.terrain_roads_ok;
	}
	if (result.loaded && result.has_draw_group_info_ini) {
		copy_draw_group_info_probe(probe_original_draw_group_info_ini_load(archive_path), result);
		result.ok = result.ok && result.draw_group_info_ok;
	}
	if (result.loaded) {
		const RealMappedImageIniProbeResult mapped_image =
			probe_original_mapped_image_ini_load(archive_path);
		copy_mapped_image_probe(mapped_image, result);
		if (mapped_image.file_exists) {
			result.ok = result.ok && result.mapped_image_ok;
		}
	}
	if (result.loaded && result.has_crate_ini) {
		copy_crate_probe(probe_original_crate_ini_load(archive_path), result);
		result.ok = result.ok && result.crate_ok;
	}
	if (result.loaded && result.has_upgrade_ini) {
		copy_upgrade_probe(probe_original_upgrade_ini_load(archive_path), result);
		result.ok = result.ok && result.upgrade_ok;
	}
	if (result.loaded &&
			result.has_command_button_ini &&
			result.has_special_power_ini &&
			result.has_upgrade_ini) {
		copy_command_button_probe(probe_original_command_button_ini_load(archive_path), result);
		result.ok = result.ok && result.command_button_ok;
	}
	if (result.loaded &&
			result.has_command_set_ini &&
			result.has_command_button_ini &&
			result.has_special_power_ini &&
			result.has_upgrade_ini) {
		copy_command_set_probe(probe_original_command_set_ini_load(archive_path), result);
		result.ok = result.ok && result.command_set_ok;
	}
	if (result.loaded &&
			result.has_control_bar_scheme_ini &&
			result.has_default_control_bar_scheme_ini) {
		copy_control_bar_scheme_probe(
			probe_original_control_bar_scheme_ini_load(archive_path),
			result);
		result.ok = result.ok && result.control_bar_scheme_ok;
	}
	if (result.loaded && result.has_water_ini) {
		copy_water_probe(probe_original_water_ini_load(archive_path), result);
		result.ok = result.ok && result.water_ok;
	}
	if (result.loaded && result.has_weather_ini) {
		copy_weather_probe(probe_original_weather_ini_load(archive_path), result);
		result.ok = result.ok && result.weather_ok;
	}
	if (result.loaded && result.has_video_ini) {
		copy_video_probe(probe_original_video_ini_load(archive_path), result);
		result.ok = result.ok && result.video_ok;
	}
	if (result.loaded && result.has_map_cache_ini && result.has_generals_csf) {
		copy_map_cache_probe(probe_original_map_cache_ini_load(archive_path), result);
		result.ok = result.ok && result.map_cache_ok;
	}

	return result;
}
