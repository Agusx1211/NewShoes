extern "C" {

static const int INPUT_CAPACITY = 1024 * 1024;
static const int NAME_CAPACITY = 1024 * 1024;
static const int MAX_WEAPON_BONUSES = 128;
static const int MAX_STANDARD_PUBLIC_BONES = 128;
static const int MAX_VERTEX_WATER_SETTINGS = 4;

struct TokenRange
{
	int start;
	int end;
};

struct StringField
{
	int offset;
	int size;
};

struct WeaponBonusRecord
{
	int bonusOffset;
	int bonusSize;
	int fieldOffset;
	int fieldSize;
	int percentX100;
	int line;
};

struct PublicBoneRecord
{
	int nameOffset;
	int nameSize;
	int line;
};

struct VertexWaterRecord
{
	int mapOffset;
	int mapSize;
	int angleX100;
	int xPositionX100;
	int yPositionX100;
	int zPositionX100;
	int xGridCells;
	int yGridCells;
	int gridSizeX100;
	int line;
};

__attribute__((used, visibility("default"))) unsigned char g_generals_gamedata_input[INPUT_CAPACITY];
__attribute__((used, visibility("default"))) char g_generals_gamedata_names[NAME_CAPACITY];

static int g_generals_gamedata_block_count = 0;
static int g_generals_gamedata_field_count = 0;
static int g_generals_gamedata_line_count = 0;
static int g_generals_gamedata_error_count = 0;
static int g_generals_gamedata_name_cursor = 0;

static StringField g_shell_map_name;
static StringField g_map_name;
static StringField g_move_hint_name;
static StringField g_terrain_lod;
static StringField g_time_of_day;
static StringField g_weather;
static StringField g_special_power_view_object;
static StringField g_auto_fire_particle_small_prefix;
static StringField g_auto_fire_particle_small_system;
static StringField g_auto_smoke_particle_large_system;

static int g_use_trees = 0;
static int g_use_fps_limit = 0;
static int g_frames_per_second_limit = 0;
static int g_max_shell_screens = 0;
static int g_use_cloud_map = 0;
static int g_use_water_plane = 0;
static int g_show_object_health = 0;
static int g_use_three_way_terrain_blends = 0;
static int g_draw_sky_box = 0;
static int g_audio_on = 0;
static int g_music_on = 0;
static int g_sounds_on = 0;
static int g_speech_on = 0;
static int g_video_on = 0;
static int g_value_per_supply_box = 0;
static int g_max_particle_count = 0;
static int g_max_field_particle_count = 0;
static int g_max_line_build_objects = 0;
static int g_max_tunnel_capacity = 0;
static int g_default_starting_cash = 0;
static int g_clear_alpha = 0;
static int g_fog_alpha = 0;
static int g_shroud_alpha = 0;
static int g_shroud_color_r = 0;
static int g_shroud_color_g = 0;
static int g_shroud_color_b = 0;
static int g_network_keep_alive_delay = 0;
static int g_network_disconnect_time = 0;
static int g_network_player_timeout_time = 0;

static int g_water_position_z_x100 = 0;
static int g_water_extent_x_x100 = 0;
static int g_water_extent_y_x100 = 0;
static int g_camera_pitch_x100 = 0;
static int g_camera_yaw_x100 = 0;
static int g_camera_height_x100 = 0;
static int g_max_camera_height_x100 = 0;
static int g_min_camera_height_x100 = 0;
static int g_scroll_amount_cutoff_x100 = 0;
static int g_particle_scale_x100 = 0;
static int g_build_speed_x100 = 0;
static int g_refund_percent_x100 = 0;
static int g_sell_percentage_x100 = 0;
static int g_keyboard_camera_rotate_speed_x100 = 0;

static WeaponBonusRecord g_weapon_bonuses[MAX_WEAPON_BONUSES];
static int g_weapon_bonus_count = 0;
static PublicBoneRecord g_public_bones[MAX_STANDARD_PUBLIC_BONES];
static int g_public_bone_count = 0;
static VertexWaterRecord g_vertex_water[MAX_VERTEX_WATER_SETTINGS];

static bool is_space(char value)
{
	return value == ' ' || value == '\t' || value == '\r' || value == '\n';
}

static bool is_token_separator(char value)
{
	return is_space(value) || value == '=';
}

static char lower_ascii(char value)
{
	if (value >= 'A' && value <= 'Z') {
		return (char)(value - 'A' + 'a');
	}

	return value;
}

static bool ascii_equal_ignore_case(const char *left, int leftSize, const char *right)
{
	int index = 0;
	while (index < leftSize && right[index] != 0) {
		if (lower_ascii(left[index]) != lower_ascii(right[index])) {
			return false;
		}
		++index;
	}

	return index == leftSize && right[index] == 0;
}

static bool ascii_starts_with_ignore_case(const char *left, int leftSize, const char *prefix)
{
	int index = 0;
	while (index < leftSize && prefix[index] != 0) {
		if (lower_ascii(left[index]) != lower_ascii(prefix[index])) {
			return false;
		}
		++index;
	}

	return prefix[index] == 0;
}

static void trim_range(const char *data, int *start, int *end)
{
	while (*start < *end && is_space(data[*start])) {
		++(*start);
	}
	while (*end > *start && is_space(data[*end - 1])) {
		--(*end);
	}
}

static int find_comment_start(const char *data, int start, int end)
{
	bool inQuote = false;
	for (int index = start; index < end; ++index) {
		const char value = data[index];
		if (value == '"') {
			inQuote = !inQuote;
		} else if (value == ';' && !inQuote) {
			return index;
		}
	}

	return end;
}

static int find_equals(const char *data, int start, int end)
{
	bool inQuote = false;
	for (int index = start; index < end; ++index) {
		const char value = data[index];
		if (value == '"') {
			inQuote = !inQuote;
		} else if (value == '=' && !inQuote) {
			return index;
		}
	}

	return -1;
}

static bool next_token(const char *data, int *cursor, int end, TokenRange *token)
{
	while (*cursor < end && is_token_separator(data[*cursor])) {
		++(*cursor);
	}

	if (*cursor >= end) {
		return false;
	}

	token->start = *cursor;
	while (*cursor < end && !is_token_separator(data[*cursor])) {
		++(*cursor);
	}
	token->end = *cursor;
	return token->end > token->start;
}

static bool token_equals(const char *data, TokenRange token, const char *value)
{
	return ascii_equal_ignore_case(data + token.start, token.end - token.start, value);
}

static int store_string(const char *value, int valueSize)
{
	if (valueSize < 0 || g_generals_gamedata_name_cursor + valueSize + 1 > NAME_CAPACITY) {
		return -1;
	}

	const int offset = g_generals_gamedata_name_cursor;
	for (int index = 0; index < valueSize; ++index) {
		g_generals_gamedata_names[g_generals_gamedata_name_cursor++] = value[index];
	}
	g_generals_gamedata_names[g_generals_gamedata_name_cursor++] = 0;
	return offset;
}

static void clear_string(StringField *field)
{
	field->offset = -1;
	field->size = 0;
}

static void assign_string(StringField *field, const char *data, int start, int end)
{
	trim_range(data, &start, &end);
	const int size = end - start;
	if (size <= 0) {
		clear_string(field);
		return;
	}

	const int offset = store_string(data + start, size);
	if (offset < 0) {
		++g_generals_gamedata_error_count;
		return;
	}

	field->offset = offset;
	field->size = size;
}

static int parse_int(const char *data, int start, int end, int *integer)
{
	if (start >= end) {
		return 0;
	}

	int cursor = start;
	bool negative = false;
	if (data[cursor] == '-' || data[cursor] == '+') {
		negative = data[cursor] == '-';
		++cursor;
	}

	int value = 0;
	bool sawDigit = false;
	while (cursor < end && data[cursor] >= '0' && data[cursor] <= '9') {
		sawDigit = true;
		value = value * 10 + (data[cursor] - '0');
		++cursor;
	}

	if (!sawDigit) {
		return 0;
	}

	*integer = negative ? -value : value;
	return 1;
}

static int parse_first_int(const char *data, int start, int end, int *integer)
{
	int cursor = start;
	TokenRange token;
	if (!next_token(data, &cursor, end, &token)) {
		return 0;
	}

	return parse_int(data, token.start, token.end, integer);
}

static int parse_real_x100(const char *data, int start, int end, int *realX100)
{
	if (start >= end) {
		return 0;
	}

	int cursor = start;
	bool negative = false;
	if (data[cursor] == '-' || data[cursor] == '+') {
		negative = data[cursor] == '-';
		++cursor;
	}

	int whole = 0;
	bool sawDigit = false;
	while (cursor < end && data[cursor] >= '0' && data[cursor] <= '9') {
		sawDigit = true;
		whole = whole * 10 + (data[cursor] - '0');
		++cursor;
	}

	int fraction = 0;
	int fractionDigits = 0;
	if (cursor < end && data[cursor] == '.') {
		++cursor;
		while (cursor < end && data[cursor] >= '0' && data[cursor] <= '9') {
			sawDigit = true;
			if (fractionDigits < 2) {
				fraction = fraction * 10 + (data[cursor] - '0');
				++fractionDigits;
			}
			++cursor;
		}
	}
	while (fractionDigits < 2) {
		fraction *= 10;
		++fractionDigits;
	}

	if (!sawDigit) {
		return 0;
	}

	const int value = whole * 100 + fraction;
	*realX100 = negative ? -value : value;
	return 1;
}

static int parse_first_real_x100(const char *data, int start, int end, int *realX100)
{
	int cursor = start;
	TokenRange token;
	if (!next_token(data, &cursor, end, &token)) {
		return 0;
	}

	return parse_real_x100(data, token.start, token.end, realX100);
}

static int parse_bool(const char *data, int start, int end, int *valueOut)
{
	int cursor = start;
	TokenRange token;
	if (!next_token(data, &cursor, end, &token)) {
		return 0;
	}

	if (token_equals(data, token, "Yes") || token_equals(data, token, "True") || token_equals(data, token, "1")) {
		*valueOut = 1;
		return 1;
	}
	if (token_equals(data, token, "No") || token_equals(data, token, "False") || token_equals(data, token, "0")) {
		*valueOut = 0;
		return 1;
	}

	return 0;
}

static int parse_rgb_component(const char *data, TokenRange token, char component, int *valueOut)
{
	if (token.end - token.start < 3 || lower_ascii(data[token.start]) != lower_ascii(component) || data[token.start + 1] != ':') {
		return 0;
	}

	return parse_int(data, token.start + 2, token.end, valueOut);
}

static int parse_rgb_color(const char *data, int start, int end, int *red, int *green, int *blue)
{
	int cursor = start;
	TokenRange token;
	int sawRed = 0;
	int sawGreen = 0;
	int sawBlue = 0;

	while (next_token(data, &cursor, end, &token)) {
		if (parse_rgb_component(data, token, 'R', red)) {
			sawRed = 1;
		} else if (parse_rgb_component(data, token, 'G', green)) {
			sawGreen = 1;
		} else if (parse_rgb_component(data, token, 'B', blue)) {
			sawBlue = 1;
		}
	}

	return sawRed && sawGreen && sawBlue;
}

static int parse_suffixed_slot(const char *data, int keyStart, int keyEnd, const char *prefix)
{
	const int keySize = keyEnd - keyStart;
	if (!ascii_starts_with_ignore_case(data + keyStart, keySize, prefix)) {
		return -1;
	}

	int prefixSize = 0;
	while (prefix[prefixSize] != 0) {
		++prefixSize;
	}

	int value = 0;
	bool sawDigit = false;
	for (int cursor = keyStart + prefixSize; cursor < keyEnd; ++cursor) {
		if (data[cursor] < '0' || data[cursor] > '9') {
			return -1;
		}
		sawDigit = true;
		value = value * 10 + (data[cursor] - '0');
	}

	if (!sawDigit || value < 1 || value > MAX_VERTEX_WATER_SETTINGS) {
		return -1;
	}

	return value - 1;
}

static void parse_weapon_bonus(const char *data, int valueStart, int valueEnd, int line)
{
	if (g_weapon_bonus_count >= MAX_WEAPON_BONUSES) {
		++g_generals_gamedata_error_count;
		return;
	}

	int cursor = valueStart;
	TokenRange bonus;
	TokenRange field;
	TokenRange percent;
	if (!next_token(data, &cursor, valueEnd, &bonus) ||
		!next_token(data, &cursor, valueEnd, &field) ||
		!next_token(data, &cursor, valueEnd, &percent)) {
		++g_generals_gamedata_error_count;
		return;
	}

	WeaponBonusRecord *record = &g_weapon_bonuses[g_weapon_bonus_count++];
	StringField bonusString;
	StringField fieldString;
	assign_string(&bonusString, data, bonus.start, bonus.end);
	assign_string(&fieldString, data, field.start, field.end);
	record->bonusOffset = bonusString.offset;
	record->bonusSize = bonusString.size;
	record->fieldOffset = fieldString.offset;
	record->fieldSize = fieldString.size;
	record->line = line;
	if (!parse_real_x100(data, percent.start, percent.end, &record->percentX100)) {
		++g_generals_gamedata_error_count;
	}
}

static void parse_public_bone(const char *data, int valueStart, int valueEnd, int line)
{
	if (g_public_bone_count >= MAX_STANDARD_PUBLIC_BONES) {
		++g_generals_gamedata_error_count;
		return;
	}

	PublicBoneRecord *record = &g_public_bones[g_public_bone_count++];
	StringField name;
	assign_string(&name, data, valueStart, valueEnd);
	record->nameOffset = name.offset;
	record->nameSize = name.size;
	record->line = line;
}

static bool parse_vertex_water_property(const char *data, int keyStart, int keyEnd, int valueStart, int valueEnd, int line)
{
	int slot = parse_suffixed_slot(data, keyStart, keyEnd, "VertexWaterAvailableMaps");
	if (slot >= 0) {
		StringField map;
		assign_string(&map, data, valueStart, valueEnd);
		g_vertex_water[slot].mapOffset = map.offset;
		g_vertex_water[slot].mapSize = map.size;
		g_vertex_water[slot].line = line;
		return true;
	}

	slot = parse_suffixed_slot(data, keyStart, keyEnd, "VertexWaterAngle");
	if (slot >= 0) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &g_vertex_water[slot].angleX100)) {
			++g_generals_gamedata_error_count;
		}
		return true;
	}

	slot = parse_suffixed_slot(data, keyStart, keyEnd, "VertexWaterXPosition");
	if (slot >= 0) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &g_vertex_water[slot].xPositionX100)) {
			++g_generals_gamedata_error_count;
		}
		return true;
	}

	slot = parse_suffixed_slot(data, keyStart, keyEnd, "VertexWaterYPosition");
	if (slot >= 0) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &g_vertex_water[slot].yPositionX100)) {
			++g_generals_gamedata_error_count;
		}
		return true;
	}

	slot = parse_suffixed_slot(data, keyStart, keyEnd, "VertexWaterZPosition");
	if (slot >= 0) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &g_vertex_water[slot].zPositionX100)) {
			++g_generals_gamedata_error_count;
		}
		return true;
	}

	slot = parse_suffixed_slot(data, keyStart, keyEnd, "VertexWaterXGridCells");
	if (slot >= 0) {
		if (!parse_first_int(data, valueStart, valueEnd, &g_vertex_water[slot].xGridCells)) {
			++g_generals_gamedata_error_count;
		}
		return true;
	}

	slot = parse_suffixed_slot(data, keyStart, keyEnd, "VertexWaterYGridCells");
	if (slot >= 0) {
		if (!parse_first_int(data, valueStart, valueEnd, &g_vertex_water[slot].yGridCells)) {
			++g_generals_gamedata_error_count;
		}
		return true;
	}

	slot = parse_suffixed_slot(data, keyStart, keyEnd, "VertexWaterGridSize");
	if (slot >= 0) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &g_vertex_water[slot].gridSizeX100)) {
			++g_generals_gamedata_error_count;
		}
		return true;
	}

	return false;
}

static void parse_property(const char *data, int keyStart, int keyEnd, int valueStart, int valueEnd, int line)
{
	++g_generals_gamedata_field_count;

	if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "ShellMapName")) {
		assign_string(&g_shell_map_name, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "MapName")) {
		assign_string(&g_map_name, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "MoveHintName")) {
		assign_string(&g_move_hint_name, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "TerrainLOD")) {
		assign_string(&g_terrain_lod, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "TimeOfDay")) {
		assign_string(&g_time_of_day, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "Weather")) {
		assign_string(&g_weather, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "SpecialPowerViewObject")) {
		assign_string(&g_special_power_view_object, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "AutoFireParticleSmallPrefix")) {
		assign_string(&g_auto_fire_particle_small_prefix, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "AutoFireParticleSmallSystem")) {
		assign_string(&g_auto_fire_particle_small_system, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "AutoSmokeParticleLargeSystem")) {
		assign_string(&g_auto_smoke_particle_large_system, data, valueStart, valueEnd);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "UseTrees")) {
		if (!parse_bool(data, valueStart, valueEnd, &g_use_trees)) { ++g_generals_gamedata_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "UseFPSLimit")) {
		if (!parse_bool(data, valueStart, valueEnd, &g_use_fps_limit)) { ++g_generals_gamedata_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "FramesPerSecondLimit")) {
		if (!parse_first_int(data, valueStart, valueEnd, &g_frames_per_second_limit)) { ++g_generals_gamedata_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "MaxShellScreens")) {
		if (!parse_first_int(data, valueStart, valueEnd, &g_max_shell_screens)) { ++g_generals_gamedata_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "UseCloudMap")) {
		if (!parse_bool(data, valueStart, valueEnd, &g_use_cloud_map)) { ++g_generals_gamedata_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "UseWaterPlane")) {
		if (!parse_bool(data, valueStart, valueEnd, &g_use_water_plane)) { ++g_generals_gamedata_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "ShowObjectHealth")) {
		if (!parse_bool(data, valueStart, valueEnd, &g_show_object_health)) { ++g_generals_gamedata_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "Use3WayTerrainBlends")) {
		if (!parse_first_int(data, valueStart, valueEnd, &g_use_three_way_terrain_blends)) { ++g_generals_gamedata_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "DrawSkyBox")) {
		if (!parse_bool(data, valueStart, valueEnd, &g_draw_sky_box)) { ++g_generals_gamedata_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "AudioOn")) {
		if (!parse_bool(data, valueStart, valueEnd, &g_audio_on)) { ++g_generals_gamedata_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "MusicOn")) {
		if (!parse_bool(data, valueStart, valueEnd, &g_music_on)) { ++g_generals_gamedata_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "SoundsOn")) {
		if (!parse_bool(data, valueStart, valueEnd, &g_sounds_on)) { ++g_generals_gamedata_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "SpeechOn")) {
		if (!parse_bool(data, valueStart, valueEnd, &g_speech_on)) { ++g_generals_gamedata_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "VideoOn")) {
		if (!parse_bool(data, valueStart, valueEnd, &g_video_on)) { ++g_generals_gamedata_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "ValuePerSupplyBox")) {
		if (!parse_first_int(data, valueStart, valueEnd, &g_value_per_supply_box)) { ++g_generals_gamedata_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "MaxParticleCount")) {
		if (!parse_first_int(data, valueStart, valueEnd, &g_max_particle_count)) { ++g_generals_gamedata_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "MaxFieldParticleCount")) {
		if (!parse_first_int(data, valueStart, valueEnd, &g_max_field_particle_count)) { ++g_generals_gamedata_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "MaxLineBuildObjects")) {
		if (!parse_first_int(data, valueStart, valueEnd, &g_max_line_build_objects)) { ++g_generals_gamedata_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "MaxTunnelCapacity")) {
		if (!parse_first_int(data, valueStart, valueEnd, &g_max_tunnel_capacity)) { ++g_generals_gamedata_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "DefaultStartingCash")) {
		if (!parse_first_int(data, valueStart, valueEnd, &g_default_starting_cash)) { ++g_generals_gamedata_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "ClearAlpha")) {
		if (!parse_first_int(data, valueStart, valueEnd, &g_clear_alpha)) { ++g_generals_gamedata_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "FogAlpha")) {
		if (!parse_first_int(data, valueStart, valueEnd, &g_fog_alpha)) { ++g_generals_gamedata_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "ShroudAlpha")) {
		if (!parse_first_int(data, valueStart, valueEnd, &g_shroud_alpha)) { ++g_generals_gamedata_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "NetworkKeepAliveDelay")) {
		if (!parse_first_int(data, valueStart, valueEnd, &g_network_keep_alive_delay)) { ++g_generals_gamedata_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "NetworkDisconnectTime")) {
		if (!parse_first_int(data, valueStart, valueEnd, &g_network_disconnect_time)) { ++g_generals_gamedata_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "NetworkPlayerTimeoutTime")) {
		if (!parse_first_int(data, valueStart, valueEnd, &g_network_player_timeout_time)) { ++g_generals_gamedata_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "WaterPositionZ")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &g_water_position_z_x100)) { ++g_generals_gamedata_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "WaterExtentX")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &g_water_extent_x_x100)) { ++g_generals_gamedata_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "WaterExtentY")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &g_water_extent_y_x100)) { ++g_generals_gamedata_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "CameraPitch")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &g_camera_pitch_x100)) { ++g_generals_gamedata_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "CameraYaw")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &g_camera_yaw_x100)) { ++g_generals_gamedata_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "CameraHeight")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &g_camera_height_x100)) { ++g_generals_gamedata_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "MaxCameraHeight")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &g_max_camera_height_x100)) { ++g_generals_gamedata_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "MinCameraHeight")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &g_min_camera_height_x100)) { ++g_generals_gamedata_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "ScrollAmountCutoff")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &g_scroll_amount_cutoff_x100)) { ++g_generals_gamedata_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "ParticleScale")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &g_particle_scale_x100)) { ++g_generals_gamedata_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "BuildSpeed")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &g_build_speed_x100)) { ++g_generals_gamedata_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "RefundPercent")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &g_refund_percent_x100)) { ++g_generals_gamedata_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "SellPercentage")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &g_sell_percentage_x100)) { ++g_generals_gamedata_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "KeyboardCameraRotateSpeed")) {
		if (!parse_first_real_x100(data, valueStart, valueEnd, &g_keyboard_camera_rotate_speed_x100)) { ++g_generals_gamedata_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "ShroudColor")) {
		if (!parse_rgb_color(data, valueStart, valueEnd, &g_shroud_color_r, &g_shroud_color_g, &g_shroud_color_b)) { ++g_generals_gamedata_error_count; }
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "WeaponBonus")) {
		parse_weapon_bonus(data, valueStart, valueEnd, line);
	} else if (ascii_equal_ignore_case(data + keyStart, keyEnd - keyStart, "StandardPublicBone")) {
		parse_public_bone(data, valueStart, valueEnd, line);
	} else {
		parse_vertex_water_property(data, keyStart, keyEnd, valueStart, valueEnd, line);
	}
}

static void parse_assignment(const char *data, int contentStart, int contentEnd, int line)
{
	const int equalsIndex = find_equals(data, contentStart, contentEnd);
	if (equalsIndex < 0) {
		return;
	}

	int keyStart = contentStart;
	int keyEnd = equalsIndex;
	int valueStart = equalsIndex + 1;
	int valueEnd = contentEnd;
	trim_range(data, &keyStart, &keyEnd);
	trim_range(data, &valueStart, &valueEnd);

	parse_property(data, keyStart, keyEnd, valueStart, valueEnd, line);
}

static void reset_parser()
{
	g_generals_gamedata_block_count = 0;
	g_generals_gamedata_field_count = 0;
	g_generals_gamedata_line_count = 0;
	g_generals_gamedata_error_count = 0;
	g_generals_gamedata_name_cursor = 0;
	g_weapon_bonus_count = 0;
	g_public_bone_count = 0;

	clear_string(&g_shell_map_name);
	clear_string(&g_map_name);
	clear_string(&g_move_hint_name);
	clear_string(&g_terrain_lod);
	clear_string(&g_time_of_day);
	clear_string(&g_weather);
	clear_string(&g_special_power_view_object);
	clear_string(&g_auto_fire_particle_small_prefix);
	clear_string(&g_auto_fire_particle_small_system);
	clear_string(&g_auto_smoke_particle_large_system);

	for (int index = 0; index < MAX_VERTEX_WATER_SETTINGS; ++index) {
		g_vertex_water[index].mapOffset = -1;
		g_vertex_water[index].mapSize = 0;
		g_vertex_water[index].angleX100 = 0;
		g_vertex_water[index].xPositionX100 = 0;
		g_vertex_water[index].yPositionX100 = 0;
		g_vertex_water[index].zPositionX100 = 0;
		g_vertex_water[index].xGridCells = 0;
		g_vertex_water[index].yGridCells = 0;
		g_vertex_water[index].gridSizeX100 = 0;
		g_vertex_water[index].line = 0;
	}

	g_use_trees = 0;
	g_use_fps_limit = 0;
	g_frames_per_second_limit = 0;
	g_max_shell_screens = 0;
	g_use_cloud_map = 0;
	g_use_water_plane = 0;
	g_show_object_health = 0;
	g_use_three_way_terrain_blends = 0;
	g_draw_sky_box = 0;
	g_audio_on = 0;
	g_music_on = 0;
	g_sounds_on = 0;
	g_speech_on = 0;
	g_video_on = 0;
	g_value_per_supply_box = 0;
	g_max_particle_count = 0;
	g_max_field_particle_count = 0;
	g_max_line_build_objects = 0;
	g_max_tunnel_capacity = 0;
	g_default_starting_cash = 0;
	g_clear_alpha = 0;
	g_fog_alpha = 0;
	g_shroud_alpha = 0;
	g_shroud_color_r = 0;
	g_shroud_color_g = 0;
	g_shroud_color_b = 0;
	g_network_keep_alive_delay = 0;
	g_network_disconnect_time = 0;
	g_network_player_timeout_time = 0;

	g_water_position_z_x100 = 0;
	g_water_extent_x_x100 = 0;
	g_water_extent_y_x100 = 0;
	g_camera_pitch_x100 = 0;
	g_camera_yaw_x100 = 0;
	g_camera_height_x100 = 0;
	g_max_camera_height_x100 = 0;
	g_min_camera_height_x100 = 0;
	g_scroll_amount_cutoff_x100 = 0;
	g_particle_scale_x100 = 0;
	g_build_speed_x100 = 0;
	g_refund_percent_x100 = 0;
	g_sell_percentage_x100 = 0;
	g_keyboard_camera_rotate_speed_x100 = 0;
}

static int vertex_water_count()
{
	int count = 0;
	for (int index = 0; index < MAX_VERTEX_WATER_SETTINGS; ++index) {
		if (g_vertex_water[index].mapOffset >= 0) {
			++count;
		}
	}
	return count;
}

__attribute__((used, visibility("default"))) unsigned int generals_gamedata_input_ptr()
{
	return (unsigned int)g_generals_gamedata_input;
}

__attribute__((used, visibility("default"))) int generals_gamedata_input_capacity()
{
	return INPUT_CAPACITY;
}

__attribute__((used, visibility("default"))) int generals_gamedata_parse(int inputSize)
{
	reset_parser();
	if (inputSize < 0 || inputSize > INPUT_CAPACITY) {
		g_generals_gamedata_error_count = 1;
		return -1;
	}

	const char *data = (const char *)g_generals_gamedata_input;
	int lineStart = 0;
	int line = 1;
	bool inGameData = false;

	while (lineStart < inputSize) {
		int lineEnd = lineStart;
		while (lineEnd < inputSize && data[lineEnd] != '\n') {
			++lineEnd;
		}

		int contentStart = lineStart;
		int contentEnd = find_comment_start(data, contentStart, lineEnd);
		trim_range(data, &contentStart, &contentEnd);

		if (contentStart < contentEnd) {
			const int equalsIndex = find_equals(data, contentStart, contentEnd);
			int cursor = contentStart;
			TokenRange first;
			if (next_token(data, &cursor, contentEnd, &first)) {
				if (equalsIndex < 0 && token_equals(data, first, "GameData")) {
					inGameData = true;
					++g_generals_gamedata_block_count;
				} else if (token_equals(data, first, "End")) {
					inGameData = false;
				} else if (inGameData) {
					parse_assignment(data, contentStart, contentEnd, line);
				}
			}
		}

		if (lineEnd >= inputSize) {
			break;
		}
		lineStart = lineEnd + 1;
		++line;
	}

	g_generals_gamedata_line_count = line;
	if (g_generals_gamedata_error_count != 0) {
		return -1;
	}

	return g_generals_gamedata_block_count;
}

__attribute__((used, visibility("default"))) int generals_gamedata_block_count() { return g_generals_gamedata_block_count; }
__attribute__((used, visibility("default"))) int generals_gamedata_field_count() { return g_generals_gamedata_field_count; }
__attribute__((used, visibility("default"))) int generals_gamedata_line_count() { return g_generals_gamedata_line_count; }
__attribute__((used, visibility("default"))) int generals_gamedata_error_count() { return g_generals_gamedata_error_count; }
__attribute__((used, visibility("default"))) int generals_gamedata_weapon_bonus_count() { return g_weapon_bonus_count; }
__attribute__((used, visibility("default"))) int generals_gamedata_standard_public_bone_count() { return g_public_bone_count; }
__attribute__((used, visibility("default"))) int generals_gamedata_vertex_water_count() { return vertex_water_count(); }

#define GAMEDATA_STRING_EXPORT(field_name, global_name) \
__attribute__((used, visibility("default"))) int generals_gamedata_##field_name##_ptr() \
{ \
	if (global_name.offset < 0) { \
		return 0; \
	} \
	return (int)(g_generals_gamedata_names + global_name.offset); \
} \
__attribute__((used, visibility("default"))) int generals_gamedata_##field_name##_size() \
{ \
	return global_name.size; \
}

GAMEDATA_STRING_EXPORT(shell_map_name, g_shell_map_name)
GAMEDATA_STRING_EXPORT(map_name, g_map_name)
GAMEDATA_STRING_EXPORT(move_hint_name, g_move_hint_name)
GAMEDATA_STRING_EXPORT(terrain_lod, g_terrain_lod)
GAMEDATA_STRING_EXPORT(time_of_day, g_time_of_day)
GAMEDATA_STRING_EXPORT(weather, g_weather)
GAMEDATA_STRING_EXPORT(special_power_view_object, g_special_power_view_object)
GAMEDATA_STRING_EXPORT(auto_fire_particle_small_prefix, g_auto_fire_particle_small_prefix)
GAMEDATA_STRING_EXPORT(auto_fire_particle_small_system, g_auto_fire_particle_small_system)
GAMEDATA_STRING_EXPORT(auto_smoke_particle_large_system, g_auto_smoke_particle_large_system)

#undef GAMEDATA_STRING_EXPORT

#define GAMEDATA_INT_EXPORT(field_name, global_name) \
__attribute__((used, visibility("default"))) int generals_gamedata_##field_name() { return global_name; }

GAMEDATA_INT_EXPORT(use_trees, g_use_trees)
GAMEDATA_INT_EXPORT(use_fps_limit, g_use_fps_limit)
GAMEDATA_INT_EXPORT(frames_per_second_limit, g_frames_per_second_limit)
GAMEDATA_INT_EXPORT(max_shell_screens, g_max_shell_screens)
GAMEDATA_INT_EXPORT(use_cloud_map, g_use_cloud_map)
GAMEDATA_INT_EXPORT(use_water_plane, g_use_water_plane)
GAMEDATA_INT_EXPORT(show_object_health, g_show_object_health)
GAMEDATA_INT_EXPORT(use_three_way_terrain_blends, g_use_three_way_terrain_blends)
GAMEDATA_INT_EXPORT(draw_sky_box, g_draw_sky_box)
GAMEDATA_INT_EXPORT(audio_on, g_audio_on)
GAMEDATA_INT_EXPORT(music_on, g_music_on)
GAMEDATA_INT_EXPORT(sounds_on, g_sounds_on)
GAMEDATA_INT_EXPORT(speech_on, g_speech_on)
GAMEDATA_INT_EXPORT(video_on, g_video_on)
GAMEDATA_INT_EXPORT(value_per_supply_box, g_value_per_supply_box)
GAMEDATA_INT_EXPORT(max_particle_count, g_max_particle_count)
GAMEDATA_INT_EXPORT(max_field_particle_count, g_max_field_particle_count)
GAMEDATA_INT_EXPORT(max_line_build_objects, g_max_line_build_objects)
GAMEDATA_INT_EXPORT(max_tunnel_capacity, g_max_tunnel_capacity)
GAMEDATA_INT_EXPORT(default_starting_cash, g_default_starting_cash)
GAMEDATA_INT_EXPORT(clear_alpha, g_clear_alpha)
GAMEDATA_INT_EXPORT(fog_alpha, g_fog_alpha)
GAMEDATA_INT_EXPORT(shroud_alpha, g_shroud_alpha)
GAMEDATA_INT_EXPORT(shroud_color_r, g_shroud_color_r)
GAMEDATA_INT_EXPORT(shroud_color_g, g_shroud_color_g)
GAMEDATA_INT_EXPORT(shroud_color_b, g_shroud_color_b)
GAMEDATA_INT_EXPORT(network_keep_alive_delay, g_network_keep_alive_delay)
GAMEDATA_INT_EXPORT(network_disconnect_time, g_network_disconnect_time)
GAMEDATA_INT_EXPORT(network_player_timeout_time, g_network_player_timeout_time)
GAMEDATA_INT_EXPORT(water_position_z_x100, g_water_position_z_x100)
GAMEDATA_INT_EXPORT(water_extent_x_x100, g_water_extent_x_x100)
GAMEDATA_INT_EXPORT(water_extent_y_x100, g_water_extent_y_x100)
GAMEDATA_INT_EXPORT(camera_pitch_x100, g_camera_pitch_x100)
GAMEDATA_INT_EXPORT(camera_yaw_x100, g_camera_yaw_x100)
GAMEDATA_INT_EXPORT(camera_height_x100, g_camera_height_x100)
GAMEDATA_INT_EXPORT(max_camera_height_x100, g_max_camera_height_x100)
GAMEDATA_INT_EXPORT(min_camera_height_x100, g_min_camera_height_x100)
GAMEDATA_INT_EXPORT(scroll_amount_cutoff_x100, g_scroll_amount_cutoff_x100)
GAMEDATA_INT_EXPORT(particle_scale_x100, g_particle_scale_x100)
GAMEDATA_INT_EXPORT(build_speed_x100, g_build_speed_x100)
GAMEDATA_INT_EXPORT(refund_percent_x100, g_refund_percent_x100)
GAMEDATA_INT_EXPORT(sell_percentage_x100, g_sell_percentage_x100)
GAMEDATA_INT_EXPORT(keyboard_camera_rotate_speed_x100, g_keyboard_camera_rotate_speed_x100)

#undef GAMEDATA_INT_EXPORT

#define GAMEDATA_INDEXED_STRING_EXPORT(collection_name, array_name, count_name, field_name, field_offset, field_size) \
__attribute__((used, visibility("default"))) int generals_gamedata_##collection_name##_##field_name##_ptr(int index) \
{ \
	if (index < 0 || index >= count_name || array_name[index].field_offset < 0) { \
		return 0; \
	} \
	return (int)(g_generals_gamedata_names + array_name[index].field_offset); \
} \
__attribute__((used, visibility("default"))) int generals_gamedata_##collection_name##_##field_name##_size(int index) \
{ \
	if (index < 0 || index >= count_name) { \
		return -1; \
	} \
	return array_name[index].field_size; \
}

GAMEDATA_INDEXED_STRING_EXPORT(weapon_bonus, g_weapon_bonuses, g_weapon_bonus_count, bonus, bonusOffset, bonusSize)
GAMEDATA_INDEXED_STRING_EXPORT(weapon_bonus, g_weapon_bonuses, g_weapon_bonus_count, field, fieldOffset, fieldSize)
GAMEDATA_INDEXED_STRING_EXPORT(standard_public_bone, g_public_bones, g_public_bone_count, name, nameOffset, nameSize)
GAMEDATA_INDEXED_STRING_EXPORT(vertex_water, g_vertex_water, MAX_VERTEX_WATER_SETTINGS, map, mapOffset, mapSize)

#undef GAMEDATA_INDEXED_STRING_EXPORT

__attribute__((used, visibility("default"))) int generals_gamedata_weapon_bonus_percent_x100(int index) { return (index < 0 || index >= g_weapon_bonus_count) ? -1 : g_weapon_bonuses[index].percentX100; }
__attribute__((used, visibility("default"))) int generals_gamedata_weapon_bonus_line(int index) { return (index < 0 || index >= g_weapon_bonus_count) ? -1 : g_weapon_bonuses[index].line; }
__attribute__((used, visibility("default"))) int generals_gamedata_standard_public_bone_line(int index) { return (index < 0 || index >= g_public_bone_count) ? -1 : g_public_bones[index].line; }
__attribute__((used, visibility("default"))) int generals_gamedata_vertex_water_line(int index) { return (index < 0 || index >= MAX_VERTEX_WATER_SETTINGS) ? -1 : g_vertex_water[index].line; }
__attribute__((used, visibility("default"))) int generals_gamedata_vertex_water_angle_x100(int index) { return (index < 0 || index >= MAX_VERTEX_WATER_SETTINGS) ? -1 : g_vertex_water[index].angleX100; }
__attribute__((used, visibility("default"))) int generals_gamedata_vertex_water_x_position_x100(int index) { return (index < 0 || index >= MAX_VERTEX_WATER_SETTINGS) ? -1 : g_vertex_water[index].xPositionX100; }
__attribute__((used, visibility("default"))) int generals_gamedata_vertex_water_y_position_x100(int index) { return (index < 0 || index >= MAX_VERTEX_WATER_SETTINGS) ? -1 : g_vertex_water[index].yPositionX100; }
__attribute__((used, visibility("default"))) int generals_gamedata_vertex_water_z_position_x100(int index) { return (index < 0 || index >= MAX_VERTEX_WATER_SETTINGS) ? -1 : g_vertex_water[index].zPositionX100; }
__attribute__((used, visibility("default"))) int generals_gamedata_vertex_water_x_grid_cells(int index) { return (index < 0 || index >= MAX_VERTEX_WATER_SETTINGS) ? -1 : g_vertex_water[index].xGridCells; }
__attribute__((used, visibility("default"))) int generals_gamedata_vertex_water_y_grid_cells(int index) { return (index < 0 || index >= MAX_VERTEX_WATER_SETTINGS) ? -1 : g_vertex_water[index].yGridCells; }
__attribute__((used, visibility("default"))) int generals_gamedata_vertex_water_grid_size_x100(int index) { return (index < 0 || index >= MAX_VERTEX_WATER_SETTINGS) ? -1 : g_vertex_water[index].gridSizeX100; }

}
