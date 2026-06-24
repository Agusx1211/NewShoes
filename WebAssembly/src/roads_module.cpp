extern "C" {

// Parses Roads.INI "Road" and "Bridge" blocks. Both block types map onto the
// single TerrainRoadType in the game engine (a road is just a bridge with the
// bridge flag cleared), so this module stores a unified record with an
// is-bridge discriminator. Field names follow the road and bridge field parse
// tables in
// GeneralsMD/Code/GameEngine/Source/GameClient/Terrain/TerrainRoads.cpp and the
// block dispatch in INITerrainRoad.cpp / INITerrainBridge.cpp. Real values are
// stored as fixed-point hundredths (x100) since the wasm ABI is integer-only.

static const int INPUT_CAPACITY = 256 * 1024;
static const int NAME_CAPACITY = 256 * 1024;
static const int MAX_ROADS = 512;

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

struct RoadRecord
{
	StringField name;
	int isBridge;
	int line;
	int fieldCount;

	StringField texture;

	// Road fields.
	int roadWidthX100;
	int roadWidthInTextureX100;

	// Bridge fields.
	int bridgeScaleX100;
	int radarColorR;
	int radarColorG;
	int radarColorB;
	int transitionEffectsHeightX100;
	int numFXPerType;
	StringField bridgeModelName;
	StringField bridgeModelNameDamaged;
	StringField bridgeModelNameBroken;
	StringField scaffoldObjectName;
	StringField towerFromLeft;
	StringField damagedToSound;
};

__attribute__((used, visibility("default"))) unsigned char g_generals_roads_input[INPUT_CAPACITY];
__attribute__((used, visibility("default"))) char g_generals_roads_names[NAME_CAPACITY];

static RoadRecord g_roads[MAX_ROADS];
static int g_road_count = 0;
static int g_field_count = 0;
static int g_line_count = 0;
static int g_error_count = 0;
static int g_name_cursor = 0;
static int g_current_road = -1;

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

static bool string_equals(const char *data, int start, int end, const char *value)
{
	return ascii_equal_ignore_case(data + start, end - start, value);
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
	if (valueSize < 0 || g_name_cursor + valueSize + 1 > NAME_CAPACITY) {
		return -1;
	}

	const int offset = g_name_cursor;
	for (int index = 0; index < valueSize; ++index) {
		g_generals_roads_names[g_name_cursor++] = value[index];
	}
	g_generals_roads_names[g_name_cursor++] = 0;
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
		++g_error_count;
		return;
	}

	field->offset = offset;
	field->size = size;
}

static void assign_token_string(StringField *field, const char *data, int start, int end)
{
	TokenRange token;
	int cursor = start;
	if (!next_token(data, &cursor, end, &token)) {
		clear_string(field);
		return;
	}

	assign_string(field, data, token.start, token.end);
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

	*realX100 = negative ? -(whole * 100 + fraction) : whole * 100 + fraction;
	return 1;
}

static int parse_first_real_x100(const char *data, int start, int end, int *realX100)
{
	TokenRange token;
	int cursor = start;
	if (!next_token(data, &cursor, end, &token)) {
		return 0;
	}

	return parse_real_x100(data, token.start, token.end, realX100);
}

static int parse_first_int(const char *data, int start, int end, int *valueOut)
{
	TokenRange token;
	int cursor = start;
	if (!next_token(data, &cursor, end, &token)) {
		return 0;
	}

	int pos = token.start;
	bool negative = false;
	if (pos < token.end && (data[pos] == '-' || data[pos] == '+')) {
		negative = data[pos] == '-';
		++pos;
	}

	int value = 0;
	bool sawDigit = false;
	while (pos < token.end && data[pos] >= '0' && data[pos] <= '9') {
		sawDigit = true;
		value = value * 10 + (data[pos] - '0');
		++pos;
	}

	if (!sawDigit) {
		return 0;
	}

	*valueOut = negative ? -value : value;
	return 1;
}

static int clamp_color(int value)
{
	if (value < 0) {
		return 0;
	}
	if (value > 255) {
		return 255;
	}
	return value;
}

static int parse_labeled_component(const char *data, int *cursor, int end)
{
	while (*cursor < end && (is_space(data[*cursor]) || data[*cursor] == ':')) {
		++(*cursor);
	}

	int value = 0;
	while (*cursor < end && data[*cursor] >= '0' && data[*cursor] <= '9') {
		value = value * 10 + (data[*cursor] - '0');
		++(*cursor);
	}

	return clamp_color(value);
}

static void parse_rgb(const char *data, int start, int end, int *r, int *g, int *b)
{
	*r = 0;
	*g = 0;
	*b = 0;
	for (int cursor = start; cursor < end; ++cursor) {
		const char label = lower_ascii(data[cursor]);
		if ((label == 'r' || label == 'g' || label == 'b') && cursor + 1 < end && data[cursor + 1] == ':') {
			++cursor;
			const int value = parse_labeled_component(data, &cursor, end);
			if (label == 'r') {
				*r = value;
			} else if (label == 'g') {
				*g = value;
			} else {
				*b = value;
			}
		}
	}
}

static void reset_state()
{
	g_road_count = 0;
	g_field_count = 0;
	g_line_count = 0;
	g_error_count = 0;
	g_name_cursor = 0;
	g_current_road = -1;
}

static void init_road(RoadRecord *road)
{
	clear_string(&road->name);
	road->isBridge = 0;
	road->line = -1;
	road->fieldCount = 0;
	clear_string(&road->texture);
	road->roadWidthX100 = 0;
	road->roadWidthInTextureX100 = 0;
	road->bridgeScaleX100 = 0;
	road->radarColorR = 0;
	road->radarColorG = 0;
	road->radarColorB = 0;
	road->transitionEffectsHeightX100 = 0;
	road->numFXPerType = 0;
	clear_string(&road->bridgeModelName);
	clear_string(&road->bridgeModelNameDamaged);
	clear_string(&road->bridgeModelNameBroken);
	clear_string(&road->scaffoldObjectName);
	clear_string(&road->towerFromLeft);
	clear_string(&road->damagedToSound);
}

static void create_road(const char *data, int nameStart, int nameEnd, int line, int isBridge)
{
	if (g_road_count >= MAX_ROADS) {
		++g_error_count;
		g_current_road = -1;
		return;
	}

	RoadRecord *road = &g_roads[g_road_count];
	init_road(road);
	assign_string(&road->name, data, nameStart, nameEnd);
	road->isBridge = isBridge;
	road->line = line;
	g_current_road = g_road_count++;
}

static void parse_block_line(const char *data, int start, int end, int line)
{
	TokenRange token;
	int cursor = start;
	if (!next_token(data, &cursor, end, &token)) {
		return;
	}

	if (token_equals(data, token, "End")) {
		g_current_road = -1;
		return;
	}

	if (token_equals(data, token, "Road")) {
		create_road(data, token.end, end, line, 0);
	} else if (token_equals(data, token, "Bridge")) {
		create_road(data, token.end, end, line, 1);
	}
}

static void parse_assignment(const char *data, int fieldStart, int fieldEnd, int valueStart, int valueEnd)
{
	if (g_current_road < 0) {
		return;
	}

	trim_range(data, &fieldStart, &fieldEnd);
	trim_range(data, &valueStart, &valueEnd);
	RoadRecord *road = &g_roads[g_current_road];
	int parsed = 1;

	if (string_equals(data, fieldStart, fieldEnd, "Texture")) {
		assign_token_string(&road->texture, data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "RoadWidth")) {
		parse_first_real_x100(data, valueStart, valueEnd, &road->roadWidthX100);
	} else if (string_equals(data, fieldStart, fieldEnd, "RoadWidthInTexture")) {
		parse_first_real_x100(data, valueStart, valueEnd, &road->roadWidthInTextureX100);
	} else if (string_equals(data, fieldStart, fieldEnd, "BridgeScale")) {
		parse_first_real_x100(data, valueStart, valueEnd, &road->bridgeScaleX100);
	} else if (string_equals(data, fieldStart, fieldEnd, "RadarColor")) {
		parse_rgb(data, valueStart, valueEnd, &road->radarColorR, &road->radarColorG, &road->radarColorB);
	} else if (string_equals(data, fieldStart, fieldEnd, "TransitionEffectsHeight")) {
		parse_first_real_x100(data, valueStart, valueEnd, &road->transitionEffectsHeightX100);
	} else if (string_equals(data, fieldStart, fieldEnd, "NumFXPerType")) {
		parse_first_int(data, valueStart, valueEnd, &road->numFXPerType);
	} else if (string_equals(data, fieldStart, fieldEnd, "BridgeModelName")) {
		assign_token_string(&road->bridgeModelName, data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "BridgeModelNameDamaged")) {
		assign_token_string(&road->bridgeModelNameDamaged, data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "BridgeModelNameBroken")) {
		assign_token_string(&road->bridgeModelNameBroken, data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "ScaffoldObjectName")) {
		assign_token_string(&road->scaffoldObjectName, data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "TowerObjectNameFromLeft")) {
		assign_token_string(&road->towerFromLeft, data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "DamagedToSound")) {
		assign_token_string(&road->damagedToSound, data, valueStart, valueEnd);
	} else if (string_equals(data, fieldStart, fieldEnd, "BridgeModelNameReallyDamaged") ||
			   string_equals(data, fieldStart, fieldEnd, "TextureDamaged") ||
			   string_equals(data, fieldStart, fieldEnd, "TextureReallyDamaged") ||
			   string_equals(data, fieldStart, fieldEnd, "TextureBroken") ||
			   string_equals(data, fieldStart, fieldEnd, "ScaffoldSupportObjectName") ||
			   string_equals(data, fieldStart, fieldEnd, "TowerObjectNameFromRight") ||
			   string_equals(data, fieldStart, fieldEnd, "TowerObjectNameToLeft") ||
			   string_equals(data, fieldStart, fieldEnd, "TowerObjectNameToRight") ||
			   string_equals(data, fieldStart, fieldEnd, "RepairedToSound") ||
			   string_equals(data, fieldStart, fieldEnd, "TransitionToOCL") ||
			   string_equals(data, fieldStart, fieldEnd, "TransitionToFX")) {
		// Recognized bridge fields that are not individually exposed; counted so
		// the per-record field total matches the source definition.
	} else {
		parsed = 0;
	}

	if (parsed) {
		road->fieldCount += 1;
		++g_field_count;
	}
}

static int string_field_ptr(StringField field)
{
	return field.offset >= 0 ? (int)(g_generals_roads_names + field.offset) : 0;
}

__attribute__((used, visibility("default"))) int generals_roads_input_ptr()
{
	return (int)g_generals_roads_input;
}

__attribute__((used, visibility("default"))) int generals_roads_input_capacity()
{
	return INPUT_CAPACITY;
}

__attribute__((used, visibility("default"))) int generals_roads_parse(int inputSize)
{
	reset_state();

	if (inputSize < 0 || inputSize > INPUT_CAPACITY) {
		g_error_count = 1;
		return -1;
	}

	const char *data = (const char *)g_generals_roads_input;
	int cursor = 0;
	int line = 1;
	while (cursor < inputSize) {
		int lineStart = cursor;
		while (cursor < inputSize && data[cursor] != '\n' && data[cursor] != '\r') {
			++cursor;
		}
		int lineEnd = cursor;
		if (cursor < inputSize && data[cursor] == '\r') {
			++cursor;
			if (cursor < inputSize && data[cursor] == '\n') {
				++cursor;
			}
		} else if (cursor < inputSize && data[cursor] == '\n') {
			++cursor;
		}

		++g_line_count;
		lineEnd = find_comment_start(data, lineStart, lineEnd);
		trim_range(data, &lineStart, &lineEnd);
		if (lineStart >= lineEnd) {
			++line;
			continue;
		}

		const int equals = find_equals(data, lineStart, lineEnd);
		if (equals >= 0) {
			parse_assignment(data, lineStart, equals, equals + 1, lineEnd);
		} else {
			parse_block_line(data, lineStart, lineEnd, line);
		}

		++line;
	}

	return g_road_count;
}

__attribute__((used, visibility("default"))) int generals_roads_count()
{
	return g_road_count;
}

__attribute__((used, visibility("default"))) int generals_roads_road_count()
{
	int count = 0;
	for (int index = 0; index < g_road_count; ++index) {
		if (!g_roads[index].isBridge) {
			++count;
		}
	}
	return count;
}

__attribute__((used, visibility("default"))) int generals_roads_bridge_count()
{
	int count = 0;
	for (int index = 0; index < g_road_count; ++index) {
		if (g_roads[index].isBridge) {
			++count;
		}
	}
	return count;
}

__attribute__((used, visibility("default"))) int generals_roads_field_count()
{
	return g_field_count;
}

__attribute__((used, visibility("default"))) int generals_roads_line_count()
{
	return g_line_count;
}

__attribute__((used, visibility("default"))) int generals_roads_error_count()
{
	return g_error_count;
}

#define ROADS_GUARD(expr, fallback) (index >= 0 && index < g_road_count ? (expr) : (fallback))

__attribute__((used, visibility("default"))) int generals_roads_name_ptr(int index)
{
	return ROADS_GUARD(string_field_ptr(g_roads[index].name), 0);
}

__attribute__((used, visibility("default"))) int generals_roads_name_size(int index)
{
	return ROADS_GUARD(g_roads[index].name.size, -1);
}

__attribute__((used, visibility("default"))) int generals_roads_is_bridge(int index)
{
	return ROADS_GUARD(g_roads[index].isBridge, -1);
}

__attribute__((used, visibility("default"))) int generals_roads_line(int index)
{
	return ROADS_GUARD(g_roads[index].line, -1);
}

__attribute__((used, visibility("default"))) int generals_roads_field_count_at(int index)
{
	return ROADS_GUARD(g_roads[index].fieldCount, -1);
}

__attribute__((used, visibility("default"))) int generals_roads_texture_ptr(int index)
{
	return ROADS_GUARD(string_field_ptr(g_roads[index].texture), 0);
}

__attribute__((used, visibility("default"))) int generals_roads_texture_size(int index)
{
	return ROADS_GUARD(g_roads[index].texture.size, -1);
}

__attribute__((used, visibility("default"))) int generals_roads_road_width_x100(int index)
{
	return ROADS_GUARD(g_roads[index].roadWidthX100, 0);
}

__attribute__((used, visibility("default"))) int generals_roads_road_width_in_texture_x100(int index)
{
	return ROADS_GUARD(g_roads[index].roadWidthInTextureX100, 0);
}

__attribute__((used, visibility("default"))) int generals_roads_bridge_scale_x100(int index)
{
	return ROADS_GUARD(g_roads[index].bridgeScaleX100, 0);
}

__attribute__((used, visibility("default"))) int generals_roads_radar_color_r(int index)
{
	return ROADS_GUARD(g_roads[index].radarColorR, -1);
}

__attribute__((used, visibility("default"))) int generals_roads_radar_color_g(int index)
{
	return ROADS_GUARD(g_roads[index].radarColorG, -1);
}

__attribute__((used, visibility("default"))) int generals_roads_radar_color_b(int index)
{
	return ROADS_GUARD(g_roads[index].radarColorB, -1);
}

__attribute__((used, visibility("default"))) int generals_roads_transition_effects_height_x100(int index)
{
	return ROADS_GUARD(g_roads[index].transitionEffectsHeightX100, 0);
}

__attribute__((used, visibility("default"))) int generals_roads_num_fx_per_type(int index)
{
	return ROADS_GUARD(g_roads[index].numFXPerType, 0);
}

__attribute__((used, visibility("default"))) int generals_roads_bridge_model_name_ptr(int index)
{
	return ROADS_GUARD(string_field_ptr(g_roads[index].bridgeModelName), 0);
}

__attribute__((used, visibility("default"))) int generals_roads_bridge_model_name_size(int index)
{
	return ROADS_GUARD(g_roads[index].bridgeModelName.size, -1);
}

__attribute__((used, visibility("default"))) int generals_roads_bridge_model_name_damaged_ptr(int index)
{
	return ROADS_GUARD(string_field_ptr(g_roads[index].bridgeModelNameDamaged), 0);
}

__attribute__((used, visibility("default"))) int generals_roads_bridge_model_name_damaged_size(int index)
{
	return ROADS_GUARD(g_roads[index].bridgeModelNameDamaged.size, -1);
}

__attribute__((used, visibility("default"))) int generals_roads_bridge_model_name_broken_ptr(int index)
{
	return ROADS_GUARD(string_field_ptr(g_roads[index].bridgeModelNameBroken), 0);
}

__attribute__((used, visibility("default"))) int generals_roads_bridge_model_name_broken_size(int index)
{
	return ROADS_GUARD(g_roads[index].bridgeModelNameBroken.size, -1);
}

__attribute__((used, visibility("default"))) int generals_roads_scaffold_object_name_ptr(int index)
{
	return ROADS_GUARD(string_field_ptr(g_roads[index].scaffoldObjectName), 0);
}

__attribute__((used, visibility("default"))) int generals_roads_scaffold_object_name_size(int index)
{
	return ROADS_GUARD(g_roads[index].scaffoldObjectName.size, -1);
}

__attribute__((used, visibility("default"))) int generals_roads_tower_from_left_ptr(int index)
{
	return ROADS_GUARD(string_field_ptr(g_roads[index].towerFromLeft), 0);
}

__attribute__((used, visibility("default"))) int generals_roads_tower_from_left_size(int index)
{
	return ROADS_GUARD(g_roads[index].towerFromLeft.size, -1);
}

__attribute__((used, visibility("default"))) int generals_roads_damaged_to_sound_ptr(int index)
{
	return ROADS_GUARD(string_field_ptr(g_roads[index].damagedToSound), 0);
}

__attribute__((used, visibility("default"))) int generals_roads_damaged_to_sound_size(int index)
{
	return ROADS_GUARD(g_roads[index].damagedToSound.size, -1);
}

}
